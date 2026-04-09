/**
 * Escalation Timer (审批升级定时器)
 *
 * 周期性检查待处理审批请求，超时自动升级或过期。
 * 运行方式: setInterval 每 30 秒扫描一次。
 */

import { createModuleLogger } from '../../../../infrastructure/logger.js';
import type { ApprovalManager } from './ApprovalManager.js';

const log = createModuleLogger('escalation-timer');

const DEFAULT_CHECK_INTERVAL_MS = 30_000; // 30 秒

export class EscalationTimer {
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly approvalManager: ApprovalManager,
    private readonly checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  ) {}

  start(): void {
    if (this.interval) return;
    log.info('Escalation timer started (interval: %dms)', this.checkIntervalMs);
    this.interval = setInterval(() => void this.tick(), this.checkIntervalMs);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    log.info('Escalation timer stopped');
  }

  private async tick(): Promise<void> {
    if (this.running) return; // 防止重叠
    this.running = true;
    try {
      const pending = await this.approvalManager.listPending();
      const now = Date.now();

      for (const req of pending) {
        if (now > req.expiresAt) {
          await this.approvalManager.expire(req.id);
          log.info('Approval %s expired (tool: %s)', req.id, req.toolName);
        }
        // 升级逻辑可在此扩展 — 检查 escalationChain 的 delayMs
      }
    } catch (err) {
      log.error('Escalation tick error: %s', err instanceof Error ? err.message : String(err));
    } finally {
      this.running = false;
    }
  }
}
