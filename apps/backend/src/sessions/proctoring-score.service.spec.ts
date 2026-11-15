import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import { EventType, RiskTier } from '@prisma/client';
import { ProctoringScoreService, toRiskTier } from './proctoring-score.service';

function harness(options: { aiDown?: boolean; aggregates?: unknown[] } = {}) {
  const events: { id: string; type: EventType; occurredAt: Date }[] = [];
  const incidents: { eventId: string }[] = [];
  const snapshots: unknown[] = [];
  const aiCalls: { ruleSet: string; indicators: Record<string, number> }[] = [];
  const emitted: unknown[] = [];
  const prisma: any = {
    proctoringEvent: {
      create: async ({ data }: any) => {
        const event = { id: `e${events.length + 1}`, ...data };
        events.push(event);
        return event;
      },
      findMany: async ({ where }: any) =>
        events.filter(
          (e) =>
            e.type === where.type &&
            e.id !== where.id.not &&
            e.occurredAt >= where.occurredAt.gte
        ),
    },
    incident: {
      findFirst: async ({ where }: any) =>
        incidents.find((i) => where.eventId.in.includes(i.eventId)) ?? null,
      create: async ({ data }: any) => {
        incidents.push(data);
        return data;
      },
    },
    $queryRaw: async () => options.aggregates ?? [],
    suspicionScoreSnapshot: {
      create: async ({ data }: any) => {
        snapshots.push(data);
      },
    },
  };
  const result = { suspicion_score: 42, tier: 'Medium', contributing_factors: [] };
  const fail = async () => {
    throw new ServiceUnavailableException();
  };
  const ai: any = {
    scoreReduced: options.aiDown
      ? fail
      : async (_s: string, _u: string, indicators: any) => {
          aiCalls.push({ ruleSet: 'reduced', indicators });
          return result;
        },
    scoreFull: options.aiDown
      ? fail
      : async (_s: string, _u: string, indicators: any) => {
          aiCalls.push({ ruleSet: 'full', indicators });
          return result;
        },
  };
  const gateway: any = { emitMonitor: (...args: unknown[]) => emitted.push(args) };
  const service = new ProctoringScoreService(prisma, ai, gateway);
  return { service, events, incidents, snapshots, aiCalls, emitted };
}

const session = (camera = false) => ({
  id: 's1',
  examId: 'x1',
  studentId: 'u1',
  exam: { requireCamera: camera, requireMicrophone: false },
});

test('repeated events of one kind within 30 s share a single incident', async () => {
  const { service, events, incidents } = harness();
  await service.record('s1', { type: EventType.TAB_SWITCH });
  await service.record('s1', { type: EventType.TAB_SWITCH });
  await service.record('s1', { type: EventType.FULLSCREEN_EXIT });
  assert.equal(events.length, 3, 'every event is still kept as evidence');
  assert.equal(incidents.length, 2);
});

test('the score covers the whole attempt from one aggregate query', async () => {
  const { service, aiCalls, snapshots } = harness({
    aggregates: [
      { type: 'TAB_SWITCH', count: 4, seconds: 0, latest: null },
      { type: 'BLACKLISTED_APP', count: 2, seconds: 5, latest: null },
      { type: 'FACE_NOT_VISIBLE', count: 1, seconds: 0, latest: 0.8 },
    ],
  });
  const score = await service.rescore(session(true));
  assert.equal(score?.suspicion_score, 42);
  assert.equal(aiCalls[0]!.ruleSet, 'full', 'camera exams always use the full rule set');
  assert.equal(aiCalls[0]!.indicators.tab_switch_count, 4);
  assert.equal(aiCalls[0]!.indicators.blacklisted_app_seconds, 5);
  assert.equal(aiCalls[0]!.indicators.face_not_visible, 0.8);
  assert.equal((snapshots[0] as any).tier, RiskTier.MEDIUM);
});

test('when the AI service is down the event is still saved and shown', async () => {
  const { service, events, emitted, snapshots } = harness({ aiDown: true });
  const event = await service.record('s1', { type: EventType.TAB_SWITCH });
  const score = await service.rescore(session());
  service.publish(session(), [event], score);
  assert.equal(score, null);
  assert.equal(events.length, 1);
  assert.equal(snapshots.length, 0);
  const [, name, payload] = emitted[0] as [string, string, any];
  assert.equal(name, 'monitor:update');
  assert.equal(payload.scorePending, true);
  assert.equal(payload.event.id, event.id);
});

test('unexpected tiers are treated as HIGH for human review', () => {
  assert.equal(toRiskTier('Low'), RiskTier.LOW);
  assert.equal(toRiskTier('HIGH'), RiskTier.HIGH);
  assert.equal(toRiskTier('weird'), RiskTier.HIGH);
});
