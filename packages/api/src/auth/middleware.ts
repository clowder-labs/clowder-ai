/**
 * Auth Middleware — the global request interceptor.
 *
 * Extracts session credential from the request, resolves it via SessionStore,
 * and injects `request.auth` (AuthContext) for business code to consume.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { InMemoryAuthSessionStore } from './session-store.js';
import type { AuthContext } from './types.js';

function extractSessionId(request: FastifyRequest): string | null {
  // Primary: Authorization header
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim() || null;
  }
  // Fallback: X-Cat-Cafe-Session header
  const sessionHeader = request.headers['x-cat-cafe-session'];
  if (typeof sessionHeader === 'string' && sessionHeader.length > 0) {
    return sessionHeader;
  }
  return null;
}

export function registerAuthMiddleware(
  app: FastifyInstance,
  sessionStore: InMemoryAuthSessionStore,
  options: { skipAuth: boolean },
): void {
  // Decorate request with auth context
  app.decorateRequest('auth', null);

  app.addHook('onRequest', async (request: FastifyRequest, _reply: FastifyReply) => {
    // Skip-auth mode (development)
    if (options.skipAuth) {
      const userId = (request.headers['x-cat-cafe-user'] as string) || 'debug-user';
      (request as FastifyRequest & { auth: AuthContext }).auth = {
        userId,
        sessionId: 'skip-auth',
        providerId: 'no-auth',
        authenticated: true,
      };
      return;
    }

    // Try session-based auth
    const sessionId = extractSessionId(request);
    if (sessionId) {
      const session = sessionStore.getBySessionId(sessionId);
      if (session) {
        (request as FastifyRequest & { auth: AuthContext }).auth = {
          userId: session.userId,
          sessionId: session.sessionId,
          providerId: session.providerId,
          authenticated: true,
        };
        return;
      }
    }

    // No valid session credential — leave request.auth as null.
    // SessionAuthority is sole truth source: only opaque session credentials
    // (Authorization: Bearer / X-Cat-Cafe-Session) are trusted here.
  });
}
