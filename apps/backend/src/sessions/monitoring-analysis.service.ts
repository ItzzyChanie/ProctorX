import { ForbiddenException, Injectable } from '@nestjs/common';
import { EventType, SessionStatus } from '@prisma/client';
import { AiService } from '../ai/ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionsGateway } from './sessions.gateway';

@Injectable()
export class MonitoringAnalysisService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private gateway: SessionsGateway
  ) {}
  async analyze(
    sessionId: string,
    studentId: string,
    kind: 'face' | 'audio',
    sample: Buffer
  ) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, studentId, status: SessionStatus.IN_PROGRESS },
      include: { exam: true },
    });

    if (!session) throw new ForbiddenException();

    if (
      (kind === 'face' && !session.exam.requireCamera) ||
      (kind === 'audio' && !session.exam.requireMicrophone)
    )
      return { skipped: true };
    const result = await this.ai.analyze(
      kind,
      sessionId,
      sample,
      kind === 'face' ? 'frame.jpg' : 'sample.wav'
    );

    const types: Record<string, EventType> = {
      face_not_visible: EventType.FACE_NOT_VISIBLE,
      excessive_eye_movement: EventType.EXCESSIVE_EYE_MOVEMENT,
      possible_talking: EventType.POSSIBLE_TALKING,
      multiple_faces: EventType.MULTIPLE_FACES_DETECTED,
      voice_detected: EventType.VOICE_DETECTED,
    };

    const emitted = [] as { id: string }[];
    for (const [name, finding] of Object.entries(result) as [string, any][])
      if (types[name] && finding.event) {
        const event = await this.prisma.proctoringEvent.create({
          data: {
            sessionId,
            type: types[name],
            intensity: finding.intensity,
            metadata: { duration_seconds: finding.duration_seconds },
            occurredAt: new Date(),
          },
        });
        await this.prisma.incident.create({
          data: { sessionId, eventId: event.id },
        });
        emitted.push(event);
      }
    if (!emitted.length) return result;
    const connectedAt = await this.gateway.connectedAt(sessionId);
    const all = await this.prisma.proctoringEvent.findMany({
      where: {
        sessionId,
        ...(connectedAt ? { occurredAt: { gte: connectedAt } } : {}),
      },
      orderBy: { occurredAt: 'desc' },
    });

    const latest = (type: EventType) =>
      all.find((event) => event.type === type)?.intensity ?? 0;
    const indicators = {
      tab_switch_count: all.filter(
        (event) => event.type === EventType.TAB_SWITCH
      ).length,
      blacklisted_app_seconds: 0,
      idle_seconds: 0,
      usb_event_count: all.filter((event) => event.type === EventType.USB_EVENT)
        .length,
      ...(session.exam.requireCamera
        ? {
            face_not_visible: latest(EventType.FACE_NOT_VISIBLE),
            excessive_eye_movement: latest(EventType.EXCESSIVE_EYE_MOVEMENT),
            possible_talking: latest(EventType.POSSIBLE_TALKING),
            multiple_faces: latest(EventType.MULTIPLE_FACES_DETECTED),
          }
        : {}),
      ...(session.exam.requireMicrophone
        ? { voice_detected: latest(EventType.VOICE_DETECTED) }
        : {}),
    };

    const score = await this.ai.scoreFull(sessionId, studentId, indicators);
    await this.prisma.suspicionScoreSnapshot.create({
      data: {
        sessionId,
        score: score.suspicion_score,
        tier: score.tier.toUpperCase(),
        contributingFactors: score.contributing_factors,
        computedAt: new Date(),
      },
    });
    
    for (const event of emitted)
      this.gateway.emitMonitor(session.examId, 'monitor:update', {
        sessionId,
        studentId,
        score: score.suspicion_score,
        tier: score.tier,
        event,
      });
    return result;
  }
}
