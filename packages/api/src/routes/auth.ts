/**
 * Authentication Routes — unified auth lifecycle endpoints.
 *
 * These routes are the thin orchestration layer between:
 * - AuthProvider (plugin-api contract)
 * - SessionStore (platform-owned)
 * - AuthMiddleware (platform-owned)
 */

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { AuthProvider, AuthSessionInfo } from '@clowder/plugin-api/auth';
import { createAuthModule, type AuthModule } from '../auth/module.js';
import type { AuthSessionRecord } from '../auth/types.js';
import { authSessionStore, InMemoryAuthSessionStore } from '../auth/session-store.js';
import { resolveHeaderUserId } from '../utils/request-identity.js';

export interface AuthRoutesOptions {
  authModule?: AuthModule;
  sessionStore?: InMemoryAuthSessionStore;
  fetchImpl?: typeof fetch;
  /** Platform-level hook called after login completes. Provider-specific post-processing belongs here. */
  onPostLogin?: (request: FastifyRequest, session: AuthSessionRecord) => Promise<void>;
}

/** Backward-compat alias — exposes session lookup by userId for legacy consumers. */
export const sessions = authSessionStore.sessionsByUserId;

function serializePresentation(provider: AuthProvider) {
  return {
    id: provider.id,
    displayName: provider.displayName,
    mode: provider.presentation.mode,
    fields: provider.presentation.fields,
    ...(provider.presentation.submitLabel ? { submitLabel: provider.presentation.submitLabel } : {}),
    ...(provider.presentation.description ? { description: provider.presentation.description } : {}),
  };
}

async function buildPublicStatus(provider: AuthProvider) {
  const config = (await provider.getPublicConfig?.()) ?? {};
  return {
    ...(config.hascode !== undefined ? { hascode: config.hascode } : { hascode: true }),
    isskip: provider.presentation.mode === 'auto',
    provider: serializePresentation(provider),
  };
}

function toSessionInfo(record: { sessionId: string; userId: string; providerId: string; expiresAt: string | null; providerState?: unknown }): AuthSessionInfo {
  return {
    sessionId: record.sessionId,
    userId: record.userId,
    providerId: record.providerId,
    providerState: record.providerState,
    expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
  };
}

async function resolveCurrentSession(
  request: FastifyRequest,
  provider: AuthProvider,
  sessionStore: InMemoryAuthSessionStore,
) {
  // auto-mode providers (no-auth): authenticate automatically
  if (provider.presentation.mode === 'auto') {
    const result = await provider.authenticate({ credentials: {} });
    if (!result.success) return null;
    const existing = sessionStore.getByUserId(result.principal.userId);
    return existing ?? sessionStore.create(provider.id, result.principal);
  }

  // For form/redirect providers: check if user has an existing session
  const userId = resolveHeaderUserId(request);
  if (!userId) return null;

  const existing = sessionStore.getByUserId(userId);
  if (existing?.providerId === provider.id) return existing;

  // Try session restore (e.g., after server restart)
  const restored = await provider.restoreSession?.(userId);
  if (!restored) return null;
  return sessionStore.create(provider.id, restored);
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, opts) => {
  const authModule = opts.authModule ?? (await createAuthModule({ fetchImpl: opts.fetchImpl }));
  const sessionStore = opts.sessionStore ?? authSessionStore;
  const provider = authModule.getActiveProvider();

  // ── GET /api/islogin ─────────────────────────────────────────────
  app.get('/api/islogin', async (request) => {
    const status = await buildPublicStatus(provider);
    const session = await resolveCurrentSession(request, provider, sessionStore);

    if (!session) {
      return { islogin: false, userId: null, ...status };
    }

    return { islogin: true, userId: session.userId, sessionId: session.sessionId, ...status };
  });

  // ── POST /api/login ──────────────────────────────────────────────
  app.post('/api/login', async (request, reply) => {
    const rawPayload = (request.body ?? {}) as Record<string, unknown>;

    // Wrap in AuthenticateInput format
    const result = await provider.authenticate({ credentials: rawPayload });
    if (!result.success) {
      return result;
    }

    const session = sessionStore.create(provider.id, result.principal);

    // Platform-triggered post-login init (provider-declared, failure non-fatal)
    if (provider.postLoginInit) {
      try {
        await provider.postLoginInit(toSessionInfo(session));
      } catch (error) {
        request.log.warn({ error, userId: session.userId }, 'postLoginInit failed (non-fatal)');
      }
    }

    // Platform-level post-login hook (e.g., model cache refresh)
    if (opts.onPostLogin) {
      try {
        await opts.onPostLogin(request, session);
      } catch (error) {
        request.log.warn({ error, userId: session.userId }, 'onPostLogin hook failed (non-fatal)');
      }
    }

    reply.header('X-Session-Id', session.sessionId);

    return {
      success: true,
      userId: session.userId,
      sessionId: session.sessionId,
      providerId: provider.id,
      message: '登录成功',
    };
  });

  // ── POST /api/logout ─────────────────────────────────────────────
  app.post('/api/logout', async (request) => {
    // Session identity only — no body.userId fallback (SessionAuthority is sole truth source)
    const userId = resolveHeaderUserId(request);

    if (!userId) {
      return { success: true, message: '退出登录成功' };
    }

    const session = sessionStore.deleteByUserId(userId);
    if (session && provider.logout) {
      try {
        await provider.logout(toSessionInfo(session));
      } catch (error) {
        // Log but don't fail the logout response
        console.warn('Provider logout hook failed:', error);
      }
    }

    return { success: true, message: '退出登录成功' };
  });
};
