import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  },
})
export class SessionsGateway {
  @WebSocketServer() server!: Server;
  private watchers = new Map<string, string>();
  private students = new Map<
    string,
    {
      sessionId: string;
      examId?: string;
      connectedAt: Date;
      lastActivityAt: Date;
    }
  >();
  private readonly activityTimeoutMs = 20_000;

  @SubscribeMessage('monitor:join') monitor(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { examId: string }
  ) {
    c.join(`exam:${b.examId}`);
  }

  @SubscribeMessage('student:join') student(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId: string; examId?: string }
  ) {
    const existing = this.students.get(c.id);
    this.students.set(c.id, {
      ...b,
      connectedAt:
        existing?.sessionId === b.sessionId ? existing.connectedAt : new Date(),
      lastActivityAt: new Date(),
    });

    c.join(`student:${b.sessionId}`);
    if (b.examId) {
      c.join(`exam:${b.examId}`);
      this.emitMonitor(b.examId, 'monitor:session-start', {
        sessionId: b.sessionId,
      });
    }
    if (this.watchers.has(b.sessionId))
      this.server.to(`student:${b.sessionId}`).emit('webrtc:request');
  }

  // SDP/ICE stays between the selected student and one watching teacher.
  @SubscribeMessage('webrtc:watch') watch(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId: string }
  ) {
    this.watchers.set(b.sessionId, c.id);
    this.server.to(`student:${b.sessionId}`).emit('webrtc:request');
  }

  @SubscribeMessage('webrtc:ready') ready(
    @MessageBody() b: { sessionId: string }
  ) {
    const watcher = this.watchers.get(b.sessionId);
    if (watcher)
      this.server.to(watcher).emit('webrtc:ready', { sessionId: b.sessionId });
  }

  @SubscribeMessage('webrtc:stop') stop(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId: string }
  ) {
    if (this.watchers.get(b.sessionId) === c.id)
      this.watchers.delete(b.sessionId);
    this.server.to(`student:${b.sessionId}`).emit('webrtc:stop');
  }

  @SubscribeMessage('webrtc:signal') signal(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId: string; signal: unknown }
  ) {
    if (c.rooms.has(`student:${b.sessionId}`)) {
      const watcher = this.watchers.get(b.sessionId);
      if (watcher)
        this.server
          .to(watcher)
          .emit('webrtc:signal', { sessionId: b.sessionId, signal: b.signal });
      return;
    }
    c.to(`student:${b.sessionId}`).emit('webrtc:signal', b.signal);
  }

  @SubscribeMessage('screen:frame') frame(
    @ConnectedSocket() c: Socket,
    @MessageBody() b: { sessionId: string; frame: Buffer; mimeType?: string }
  ) {
    if (!c.rooms.has(`student:${b.sessionId}`)) return;
    const student = this.students.get(c.id);
    if (student?.sessionId === b.sessionId) student.lastActivityAt = new Date();
    const watcher = this.watchers.get(b.sessionId);
    if (watcher)
      this.server.to(watcher).emit('screen:frame', {
        sessionId: b.sessionId,
        frame: b.frame,
        mimeType: b.mimeType,
      });
  }

  handleDisconnect(c: Socket) {
    for (const [sessionId, watcher] of this.watchers)
      if (watcher === c.id) this.watchers.delete(sessionId);
    const student = this.students.get(c.id);
    this.students.delete(c.id);

    if (student?.examId && !this.isStudentConnected(student.sessionId))
      this.emitMonitor(student.examId, 'monitor:session-end', {
        sessionId: student.sessionId,
      });
  }

  isStudentConnected(sessionId: string) {
    const activeAfter = Date.now() - this.activityTimeoutMs;
    return [...this.students.values()].some(
      (student) =>
        student.sessionId === sessionId &&
        student.lastActivityAt.getTime() >= activeAfter
    );
  }

  activeSessionIds(examId: string) {
    const activeAfter = Date.now() - this.activityTimeoutMs;
    return new Set(
      [...this.students.values()]
        .filter(
          (student) =>
            student.examId === examId &&
            student.lastActivityAt.getTime() >= activeAfter
        )
        .map((student) => student.sessionId)
    );
  }

  connectedAt(sessionId: string) {
    const connections = [...this.students.values()].filter(
      (student) => student.sessionId === sessionId
    );
    if (!connections.length) return undefined;
    return new Date(
      Math.min(...connections.map((student) => student.connectedAt.getTime()))
    );
  }

  clearExam(examId: string) {
    const sessionIds = new Set(
      [...this.students.values()]
        .filter((student) => student.examId === examId)
        .map((student) => student.sessionId)
    );

    for (const [socketId, student] of this.students)
      if (student.examId === examId) this.students.delete(socketId);

    for (const sessionId of sessionIds) {
      this.watchers.delete(sessionId);
      this.server
        .to(`student:${sessionId}`)
        .emit('student:exam-ended', { message: 'This assessment has ended.' });
      this.emitMonitor(examId, 'monitor:session-end', { sessionId });
    }
  }

  emitMonitor(examId: string, event: string, payload: unknown) {
    this.server.to(`exam:${examId}`).emit(event, payload);
  }

  warn(
    sessionId: string,
    warning: { id: string; message: string; sentAt: Date }
  ) {
    this.server.to(`student:${sessionId}`).emit('student:warn', warning);
  }

  lock(sessionId: string, locked: boolean) {
    this.server.to(`student:${sessionId}`).emit('student:lock', { locked });
  }

  timeAdjusted(
    examId: string,
    sessionId: string,
    remainingSeconds: number,
    extraTimeSeconds: number
  ) {
    const payload = { sessionId, remainingSeconds, extraTimeSeconds };
    this.server
      .to(`student:${sessionId}`)
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
    this.server.to(`student:${sessionId}`).emit('student:resume', {
      sessionId,
    });
  }

  emitIntegrityReviewUpdated() {
    this.server.emit('integrity:review-updated');
  }
}
