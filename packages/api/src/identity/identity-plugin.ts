/**
 * Fastify Identity Plugin — decorates requests with resolved identity.
 *
 * Usage:
 *   await app.register(identityPlugin, { config, nonceStore });
 *   // Then in any route handler:
 *   const identity = request.resolvedIdentity;
 *
 * Migration path:
 *   Phase 1: Register plugin → routes can opt-in via request.resolvedIdentity
 *   Phase 2: Remove query-param fallback from resolveUserId()
 *   Phase 3: All routes use request.resolvedIdentity exclusively
 *
 * @see binary-core-product-line-v3.md §4.1
 * [宪宪/Opus-46🐾] Phase 1 — Identity Plugin
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { IdentityConfig, NonceStore, ResolvedIdentity } from './identity-resolver.js';
import { IdentityResolver } from './identity-resolver.js';

// ─── Fastify type augmentation ───────────────────────

declare module 'fastify' {
  interface FastifyRequest {
    resolvedIdentity?: ResolvedIdentity;
  }
}

// ─── Plugin Options ──────────────────────────────────

export interface IdentityPluginOptions {
  config: IdentityConfig;
  nonceStore?: NonceStore;
}

// ─── Plugin ──────────────────────────────────────────

export const identityPlugin: FastifyPluginAsync<IdentityPluginOptions> = async (app, opts) => {
  const resolver = new IdentityResolver(opts.config, opts.nonceStore);

  app.decorateRequest('resolvedIdentity', undefined);

  app.addHook('onRequest', async (request: FastifyRequest) => {
    // Skip non-API routes (health, static, socket.io)
    if (!request.url.startsWith('/api/')) return;

    const result = await resolver.resolve(request);
    if (result.ok) {
      request.resolvedIdentity = result.identity;
    }
    // In no-auth mode, identity always resolves.
    // In trusted-header mode, missing header → no identity (routes decide how to handle).
    // We do NOT block the request here — that's the route's responsibility.
  });
};
