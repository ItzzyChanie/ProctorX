import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Role, SessionStatus } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import {
  authenticateSocket,
  hasPermission,
  SocketUser,
} from '../common/socket-auth';
import { PrismaService } from '../prisma/prisma.service';

/*
 * Room layout (all state lives in rooms + socket.data so it survives the
 * Redis adapter / multiple backend instances):
 *   monitor:<examId>        teachers monitoring an exam (receive monitor:*)
 *   exam-students:<examId>  student sockets taking an exam
 *   student:<sessionId>     the student socket(s) of one attempt
 *   watch:<sessionId>       teacher sockets viewing that student's screen
 *   fallback:<sessionId>    viewers whose WebRTC failed and need image frames
 */
const rooms = {
  monitor: (examId: string) => `monitor:${examId}`,
  examStudents: (examId: string) => `exam-students:${examId}`,
  student: (sessionId: string) => `student:${sessionId}`,
  watch: (sessionId: string) => `watch:${sessionId}`,
  fallback: (sessionId: string) => `fallback:${sessionId}`,
};

type StudentData = {
  user?: SocketUser;
  sessionId?: string;
  examId?: string;
  connectedAt?: number;
  lastActivityAt?: number;
  lastFrameAt?: number;
  screenSharing?: boolean;
  /** 'camera' when a phone/tablet streams its front camera instead of the screen. */
  feedSource?: 'screen' | 'camera';
};
type TeacherData = {
  user?: SocketUser;
  monitorExamId?: string;
  watching?: string[];
};
type Quality = 'off' | 'thumb' | 'focus';

const MAX_FRAME_BYTES = 512 * 1024;
const MIN_FRAME_INTERVAL_MS = 400;

@WebSocketGateway()
export class SessionsGateway implements OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly activityTimeoutMs = 20_000;

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService
  ) {}

  private auth(c: Socket) {
    return authenticateSocket(c, this.jwt, this.prisma);
  }

  private async teacher(c: Socket) {
    const user = await this.auth(c);
    if (
      !user ||
      user.role !== Role.TEACHER ||
      !(await hasPermission(this.prisma, user, 'VIEW_OWN_CLASS_SESSIONS'))
    )
      return null;
    return user;
  }

  /** The teacher must be monitoring the exam this attempt belongs to. */
  private canControl(c: Socket, sessionId: unknown) {
    return typeof sessionId === 'string' && c.rooms.has(rooms.watch(sessionId));
  }

  private touch(c: Socket) {
    (c.data as StudentData).lastActivityAt = Date.now();
  }

  // ---------------------------------------------------------------- teacher

  @SubscribeMessage('monitor:join') async monitor(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { examId?: string }
  ) {
    const user = await this.teacher(c);
    if (!user || typeof b?.examId !== 'string') return { ok: false };
    const exam = await this.prisma.exam.findFirst({
      where: { id: b.examId, subject: { teacherId: user.id } },
      select: { id: true },
    });
    if (!exam) return { ok: false };
    const data = c.data as TeacherData;
    if (data.monitorExamId && data.monitorExamId !== exam.id)
      await this.unwatchAll(c);
    data.monitorExamId = exam.id;
    await c.join(rooms.monitor(exam.id));
    return { ok: true };
  }

  @SubscribeMessage('webrtc:watch') async watch(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId?: string; connectionId?: string }
  ) {
    const user = await this.teacher(c);
    const data = c.data as TeacherData;
    if (
      !user ||
      !data.monitorExamId ||
      typeof b?.sessionId !== 'string' ||
      typeof b?.connectionId !== 'string'
    )
      return { ok: false };
    const session = await this.prisma.examSession.findFirst({
      where: {
        id: b.sessionId,
        examId: data.monitorExamId,
        exam: { subject: { teacherId: user.id } },
      },
      select: { id: true },
    });
    if (!session) return { ok: false };
    await c.join(rooms.watch(session.id));
    data.watching = [...new Set([...(data.watching ?? []), session.id])];
    // Each viewer gets its own peer connection on the student side, so any
    // number of tabs / co-proctors can watch the same screen.
    this.server
      .to(rooms.student(session.id))
      .emit('webrtc:request', {
        viewerId: c.id,
        connectionId: b.connectionId,
      });
    return { ok: true };
  }

  @SubscribeMessage('webrtc:unwatch') async unwatch(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId?: string; connectionId?: string }
  ) {
    if (!this.canControl(c, b?.sessionId)) return { ok: false };
    await this.stopWatching(c.id, b.sessionId!, c, b.connectionId);
    return { ok: true };
  }

  @SubscribeMessage('webrtc:quality') quality(
    @ConnectedSocket() c: Socket,
    @MessageBody()
    b: {
      sessionId?: string;
      quality?: Quality;
      connectionId?: string;
    }
  ) {
    if (
      !this.canControl(c, b?.sessionId) ||
      !['off', 'thumb', 'focus'].includes(b.quality as string)
    )
      return;
    this.server
      .to(rooms.student(b.sessionId!))
      .emit('webrtc:quality', {
        viewerId: c.id,
        connectionId: b.connectionId,
        quality: b.quality,
      });
  }

  @SubscribeMessage('screen:fallback') async fallback(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId?: string; enabled?: boolean }
  ) {
    if (!this.canControl(c, b?.sessionId)) return;
    if (b.enabled) await c.join(rooms.fallback(b.sessionId!));
    else await c.leave(rooms.fallback(b.sessionId!));
    await this.syncFallback(b.sessionId!);
  }

  // ---------------------------------------------------------------- student

  @SubscribeMessage('student:join') async student(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId?: string }
  ) {
    const user = await this.auth(c);
    if (!user || user.role !== Role.STUDENT || typeof b?.sessionId !== 'string')
      return { ok: false };
    // Never trust the client for ownership or the exam id.
    const session = await this.prisma.examSession.findFirst({
      where: {
        id: b.sessionId,
        studentId: user.id,
        status: { in: [SessionStatus.IN_PROGRESS, SessionStatus.DISCONNECTED] },
      },
      select: { id: true, examId: true },
    });
    if (!session) return { ok: false };
    const wasConnected = await this.isStudentConnected(session.id);
    const data = c.data as StudentData;
    const now = Date.now();
    if (data.sessionId !== session.id) data.connectedAt = now;
    data.sessionId = session.id;
    data.examId = session.examId;
    data.lastActivityAt = now;
    await c.join([
      rooms.student(session.id),
      rooms.examStudents(session.examId),
    ]);
    if (!wasConnected)
      this.emitMonitor(session.examId, 'monitor:session-start', {
        sessionId: session.id,
      });
    // Re-offer the screen to every teacher already watching this attempt.
    const viewers = await this.server
      .in(rooms.watch(session.id))
      .fetchSockets();
    viewers.forEach((viewer) =>
      c.emit('webrtc:request', { viewerId: viewer.id })
    );
    await this.syncFallback(session.id);
    return { ok: true };
  }

  @SubscribeMessage('student:heartbeat') heartbeat(
    @ConnectedSocket() c: Socket
  ) {
    if ((c.data as StudentData).sessionId) this.touch(c);
  }

  @SubscribeMessage('screen:state') async screenState(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sharing?: boolean; source?: string }
  ) {
    const data = c.data as StudentData;
    if (!data.sessionId || !data.examId) return;
    data.screenSharing = Boolean(b?.sharing);
    data.feedSource = b?.source === 'camera' ? 'camera' : 'screen';
    this.touch(c);
    this.emitMonitor(data.examId, 'monitor:screen-state', {
      sessionId: data.sessionId,
      sharing: data.screenSharing,
      source: data.feedSource,
    });
  }

  @SubscribeMessage('webrtc:ready') ready(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { viewerId?: string; connectionId?: string }
  ) {
    const { sessionId } = c.data as StudentData;
    if (
      !sessionId ||
      typeof b?.viewerId !== 'string' ||
      typeof b?.connectionId !== 'string'
    )
      return;
    this.server
      .to(b.viewerId)
      .emit('webrtc:ready', { sessionId, connectionId: b.connectionId });
  }

  @SubscribeMessage('webrtc:signal') signal(
    @ConnectedSocket() c: Socket,
    @MessageBody()
    b: {
      sessionId?: string;
      viewerId?: string;
      connectionId?: string;
      signal: unknown;
    }
  ) {
    const { sessionId } = c.data as StudentData;
    if (sessionId) {
      // Student -> one specific viewer. The sessionId comes from the
      // authenticated socket, so a student can only speak for itself.
      if (typeof b?.viewerId === 'string')
        this.server
          .to(b.viewerId)
          .emit('webrtc:signal', {
            sessionId,
            connectionId: b.connectionId,
            signal: b.signal,
          });
      return;
    }
    if (!this.canControl(c, b?.sessionId)) return;
    this.server
      .to(rooms.student(b.sessionId!))
      .emit('webrtc:signal', {
        viewerId: c.id,
        connectionId: b.connectionId,
        signal: b.signal,
      });
  }

  @SubscribeMessage('screen:frame') frame(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { frame?: Buffer | ArrayBuffer; mimeType?: string }
  ) {
    const data = c.data as StudentData;
    if (!data.sessionId || !b?.frame) return;
    this.touch(c);
    const size =
      b.frame instanceof ArrayBuffer ? b.frame.byteLength : b.frame.length;
    const now = Date.now();
    if (
      size > MAX_FRAME_BYTES ||
      now - (data.lastFrameAt ?? 0) < MIN_FRAME_INTERVAL_MS
    )
      return;
    data.lastFrameAt = now;
    this.server
      .to(rooms.fallback(data.sessionId))
      .volatile.emit('screen:frame', {
        sessionId: data.sessionId,
        frame: b.frame,
        mimeType:
          b.mimeType === 'image/jpeg' || b.mimeType === 'image/png'
            ? b.mimeType
            : 'image/webp',
      });
  }

  // -------------------------------------------------------------- lifecycle

  async handleDisconnect(c: Socket) {
    const data = c.data as StudentData & TeacherData;
    // socket.io empties c.rooms before 'disconnect', hence socket.data.
    for (const sessionId of data.watching ?? [])
      await this.stopWatching(c.id, sessionId);
    if (
      data.sessionId &&
      data.examId &&
      !(await this.isStudentConnected(data.sessionId))
    )
      this.emitMonitor(data.examId, 'monitor:session-end', {
        sessionId: data.sessionId,
      });
  }

  private async unwatchAll(c: Socket) {
    const data = c.data as TeacherData;
    for (const sessionId of data.watching ?? [])
      await this.stopWatching(c.id, sessionId, c);
  }

  private async stopWatching(
    viewerId: string,
    sessionId: string,
    c?: Socket,
    connectionId?: string
  ) {
    if (c) {
      await c.leave(rooms.watch(sessionId));
      await c.leave(rooms.fallback(sessionId));
      const data = c.data as TeacherData;
      data.watching = (data.watching ?? []).filter((id) => id !== sessionId);
    }
    this.server
      .to(rooms.student(sessionId))
      .emit('webrtc:stop', { viewerId, connectionId });
    await this.syncFallback(sessionId);
  }

  /** Students only encode image frames while some viewer actually needs them. */
  private async syncFallback(sessionId: string) {
    const viewers = await this.server
      .in(rooms.fallback(sessionId))
      .fetchSockets();
    this.server
      .to(rooms.student(sessionId))
      .emit('screen:fallback', { enabled: viewers.length > 0 });
  }

  private async studentSockets(room: string) {
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.map((socket) => socket.data as StudentData);
  }

  private isActive(data: StudentData, activeAfter: number) {
    return (data.lastActivityAt ?? 0) >= activeAfter;
  }

  async isStudentConnected(sessionId: string) {
    const activeAfter = Date.now() - this.activityTimeoutMs;
    return (await this.studentSockets(rooms.student(sessionId))).some((data) =>
      this.isActive(data, activeAfter)
    );
  }

  async activeSessionIds(examId: string) {
    return new Set((await this.studentStates(examId)).keys());
  }

  /** Live connection + screen-share state for every active attempt. */
  async studentStates(examId: string) {
    const activeAfter = Date.now() - this.activityTimeoutMs;
    const states = new Map<
      string,
      { screenSharing: boolean; feedSource: 'screen' | 'camera' }
    >();
    for (const data of await this.studentSockets(rooms.examStudents(examId))) {
      if (!data.sessionId || !this.isActive(data, activeAfter)) continue;
      const previous = states.get(data.sessionId);
      const sharing =
        Boolean(data.screenSharing) || Boolean(previous?.screenSharing);
      states.set(data.sessionId, {
        screenSharing: sharing,
        feedSource:
          data.feedSource === 'camera' || previous?.feedSource === 'camera'
            ? 'camera'
            : 'screen',
      });
    }
    return states;
  }

  async clearExam(examId: string) {
    const sessionIds = new Set(
      (await this.studentSockets(rooms.examStudents(examId)))
        .map((data) => data.sessionId)
        .filter((id): id is string => Boolean(id))
    );
    for (const sessionId of sessionIds) {
      this.server
        .to(rooms.student(sessionId))
        .emit('student:exam-ended', { message: 'This assessment has ended.' });
      this.server
        .in(rooms.student(sessionId))
        .socketsLeave([rooms.student(sessionId), rooms.examStudents(examId)]);
      this.server
        .in(rooms.watch(sessionId))
        .socketsLeave([rooms.watch(sessionId), rooms.fallback(sessionId)]);
      this.emitMonitor(examId, 'monitor:session-end', { sessionId });
    }
  }

  emitMonitor(examId: string, event: string, payload: unknown) {
    this.server.to(rooms.monitor(examId)).emit(event, payload);
  }

  warn(
    sessionId: string,
    warning: { id: string; message: string; sentAt: Date }
  ) {
    this.server.to(rooms.student(sessionId)).emit('student:warn', warning);
  }

  lock(sessionId: string, locked: boolean) {
    this.server.to(rooms.student(sessionId)).emit('student:lock', { locked });
  }

  timeAdjusted(
    examId: string,
    sessionId: string,
    remainingSeconds: number,
    extraTimeSeconds: number
  ) {
    const payload = { sessionId, remainingSeconds, extraTimeSeconds };
    this.server
      .to(rooms.student(sessionId))
      .emit('student:time-adjusted', payload);
    this.emitMonitor(examId, 'monitor:time-adjusted', payload);
  }

  warningAcknowledged(examId: string, sessionId: string, warningId: string) {
    this.emitMonitor(examId, 'monitor:warning-acknowledged', {
      sessionId,
      warningId,
      acknowledgedAt: new Date(),
    });
  }

  resume(sessionId: string) {
    this.server.to(rooms.student(sessionId)).emit('student:resume', {
      sessionId,
    });
  }

  emitIntegrityReviewUpdated() {
    this.server.emit('integrity:review-updated');
  }
}
