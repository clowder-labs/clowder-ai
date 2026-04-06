/**
 * Health & Readiness Routes — Binary Core Observability Contract (§4.7)
 *
 * GET /api/health  — Liveness probe (always 200 if process is running)
 * GET /api/readyz  — Readiness probe (checks Redis connectivity when configured)
 *
 * Kubernetes / load-balancer compatible:
 *   liveness  → restart container if unhealthy
 *   readiness → remove from rotation until ready
 *
 * [宪宪/Opus-46🐾] Phase 1 — Observability Contract
 */

import type { RedisClient } from '@cat-cafe/shared/utils';
import type { FastifyPluginAsync } from 'fastify';
import { CORE_API_VERSION } from '../edition/edition-loader.js';

// ─── Types ───────────────────────────────────────────

interface ComponentHealth {
  status: 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  reason?: string;
}

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  version: string;
  uptime: number;
  timestamp: string;
  components?: Record<string, ComponentHealth>;
}

export interface HealthRoutesOptions {
  redis?: RedisClient;
}

// ─── Route Plugin ────────────────────────────────────

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, opts) => {
  const { redis } = opts;
  const startTime = Date.now();

  /**
   * GET /api/health — Liveness probe
   * Always returns 200 if the process can handle HTTP.
   */
  app.get('/api/health', async () => {
    const response: HealthResponse = {
      status: 'ok',
      version: CORE_API_VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
    };
    return response;
  });

  /**
   * GET /api/readyz — Readiness probe
   * Checks Redis (if configured). Returns 503 if not ready.
   */
  app.get('/api/readyz', async (_request, reply) => {
    const components: Record<string, ComponentHealth> = {};
    let overall: 'ok' | 'degraded' | 'down' = 'ok';

    // Redis check
    if (redis) {
      const t0 = Date.now();
      try {
        await redis.ping();
        components.redis = { status: 'ok', latencyMs: Date.now() - t0 };
      } catch (err) {
        components.redis = {
          status: 'down',
          latencyMs: Date.now() - t0,
          reason: err instanceof Error ? err.message : String(err),
        };
        overall = 'down';
      }
    } else {
      components.redis = { status: 'ok', reason: 'memory-mode (no Redis configured)' };
    }

    const response: HealthResponse = {
      status: overall,
      version: CORE_API_VERSION,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      timestamp: new Date().toISOString(),
      components,
    };

    if (overall !== 'ok') {
      return reply.status(503).send(response);
    }
    return response;
  });
};
