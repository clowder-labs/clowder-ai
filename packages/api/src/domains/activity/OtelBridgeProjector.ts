/**
 * OTel Bridge Projector (Issue #480 commitment)
 *
 * Subscribes to ActivityEventBus and forwards L1-L3 product-level events
 * to F153 OTel instruments. This bridges the product fact spine with the
 * runtime observability infrastructure — OTel owns telemetry, the bus
 * owns typed facts, this projector connects them.
 */

import type { ActivityEvent } from '@cat-cafe/shared';
import { isCoCreatorActor } from '@cat-cafe/shared';
import { createModuleLogger } from '../../infrastructure/logger.js';
import {
  catInvocationCount,
  sessionRounds,
  taskCompleted,
  taskDuration,
} from '../../infrastructure/telemetry/instruments.js';
import type { ActivityEventBus } from './ActivityEventBus.js';

const log = createModuleLogger('otel-bridge-projector');

const CAT_ACTIVITY_EVENTS = new Set([
  'tool_used',
  'task_completed',
  'message_sent',
  'review_submitted',
  'bug_caught',
  'evidence_cited',
  'rich_block_created',
  'design_feedback_given',
]);

export class OtelBridgeProjector {
  constructor(bus: ActivityEventBus) {
    bus.on(this.handleEvent);
    log.info('OtelBridgeProjector subscribed to ActivityEventBus');
  }

  private handleEvent = (event: ActivityEvent): void => {
    try {
      const agentId = event.actorId ?? 'unknown';

      if (event.type === 'task_completed') {
        const status = (event.metadata?.status as string) ?? 'ok';
        taskCompleted.add(1, { 'agent.id': agentId, status });

        const durationS = event.metadata?.durationMs ? Number(event.metadata.durationMs) / 1000 : undefined;
        if (durationS !== undefined && durationS > 0) {
          taskDuration.record(durationS, { 'agent.id': agentId });
        }
      }

      if (event.type === 'session_sealed') {
        const rounds = event.metadata?.rounds;
        if (typeof rounds === 'number' && rounds > 0) {
          sessionRounds.record(rounds, { 'agent.id': agentId });
        }
      }

      if (CAT_ACTIVITY_EVENTS.has(event.type) && !isCoCreatorActor(agentId)) {
        const trigger = (event.metadata?.trigger as string) ?? 'default';
        catInvocationCount.add(1, { 'agent.id': agentId, trigger });
      }
    } catch (err: unknown) {
      log.warn({ err, type: event.type }, 'OtelBridgeProjector error');
    }
  };
}
