/**
 * Unified Identity Resolution for Binary Core.
 *
 * Core only does identity *resolution* (who are you?), not *authentication*
 * (prove who you are). Authentication is Edition's responsibility via Login Gateway.
 *
 * Three modes:
 *   no-auth       — all requests → default-user (local dev / personal deploy)
 *   trusted-header — read X-Cat-Cafe-User from trusted gateway
 *   jwt            — verify JWT signature, extract claims
 *
 * @see binary-core-product-line-v3.md §4.1
 * [宪宪/Opus-46🐾] Phase 1 — Identity Boundary
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

// ─── Types ────────────────────────────────────────────

export type IdentityMode = 'no-auth' | 'trusted-header' | 'jwt';

export interface TrustedHeaderConfig {
  /** Header name for user identity. Default: x-cat-cafe-user */
  userHeader?: string;
  /** Require HMAC-signed headers for mixed/public deploys. Default: false */
  requireSignedHeaders?: boolean;
  /** Signature header name. Default: x-cat-cafe-signature */
  signatureHeader?: string;
  /** Timestamp header name. Default: x-cat-cafe-timestamp */
  timestampHeader?: string;
  /** Nonce header name. Default: x-cat-cafe-nonce */
  nonceHeader?: string;
  /** Env var holding HMAC shared secret. Default: CAT_CAFE_HEADER_SHARED_SECRET */
  sharedSecretEnv?: string;
  /** Max clock skew in seconds. Default: 30 */
  maxSkewSeconds?: number;
}

export interface JwtConfig {
  issuer?: string;
  audience?: string | string[];
  /** JWKS endpoint URL (fetched at startup). */
  jwksUrl?: string;
  /** PEM public key (alternative to jwksUrl). */
  publicKeyPem?: string;
  /** Clock tolerance in seconds. Default: 30 */
  clockToleranceSec?: number;
}

export interface IdentityConfig {
  mode: IdentityMode;
  /** Default user ID for no-auth mode. Default: 'default-user' */
  defaultUserId?: string;
  trustedHeader?: TrustedHeaderConfig;
  jwt?: JwtConfig;
}

export interface ResolvedIdentity {
  userId: string;
  mode: IdentityMode;
  source: 'default' | 'trusted-header' | 'jwt';
  claims?: Record<string, unknown>;
}

export type IdentityErrorCode =
  | 'MISSING_IDENTITY'
  | 'UNTRUSTED_TRANSPORT'
  | 'INVALID_SIGNATURE'
  | 'REPLAY_DETECTED'
  | 'JWT_INVALID';

export interface IdentityError {
  code: IdentityErrorCode;
  message: string;
  statusCode: 401 | 403;
}

export type IdentityResult = { ok: true; identity: ResolvedIdentity } | { ok: false; error: IdentityError };

// ─── Nonce store interface (Redis-backed in production) ──

export interface NonceStore {
  /** Returns true if nonce was already seen (replay). */
  checkAndMark(nonce: string, ttlSeconds: number): Promise<boolean>;
}

// ─── Default constants ────────────────────────────────

const DEFAULT_USER_HEADER = 'x-cat-cafe-user';
const DEFAULT_SIGNATURE_HEADER = 'x-cat-cafe-signature';
const DEFAULT_TIMESTAMP_HEADER = 'x-cat-cafe-timestamp';
const DEFAULT_NONCE_HEADER = 'x-cat-cafe-nonce';
const DEFAULT_SECRET_ENV = 'CAT_CAFE_HEADER_SHARED_SECRET';
const DEFAULT_MAX_SKEW = 30;
const DEFAULT_USER_ID = 'default-user';

// ─── IdentityResolver ────────────────────────────────

export class IdentityResolver {
  private readonly config: IdentityConfig;
  private readonly nonceStore: NonceStore | null;

  constructor(config: IdentityConfig, nonceStore?: NonceStore) {
    this.config = config;
    this.nonceStore = nonceStore ?? null;
  }

  async resolve(request: FastifyRequest): Promise<IdentityResult> {
    switch (this.config.mode) {
      case 'no-auth':
        return this.resolveNoAuth();
      case 'trusted-header':
        return this.resolveTrustedHeader(request);
      case 'jwt':
        return this.resolveJwt(request);
      default:
        return {
          ok: false,
          error: { code: 'MISSING_IDENTITY', message: `Unknown identity mode: ${this.config.mode}`, statusCode: 401 },
        };
    }
  }

  private resolveNoAuth(): IdentityResult {
    return {
      ok: true,
      identity: {
        userId: this.config.defaultUserId ?? DEFAULT_USER_ID,
        mode: 'no-auth',
        source: 'default',
      },
    };
  }

  private async resolveTrustedHeader(request: FastifyRequest): Promise<IdentityResult> {
    const hc = this.config.trustedHeader ?? {};
    const userHeader = hc.userHeader ?? DEFAULT_USER_HEADER;

    const rawUser = request.headers[userHeader];
    const userId = typeof rawUser === 'string' ? rawUser.trim() : '';

    if (!userId) {
      return {
        ok: false,
        error: { code: 'MISSING_IDENTITY', message: `Missing ${userHeader} header`, statusCode: 401 },
      };
    }

    // If signed headers are required, validate signature
    if (hc.requireSignedHeaders) {
      const sigResult = await this.validateSignedHeaders(request, userId, hc);
      if (!sigResult.ok) return sigResult;
    }

    return {
      ok: true,
      identity: { userId, mode: 'trusted-header', source: 'trusted-header' },
    };
  }

  private async validateSignedHeaders(
    request: FastifyRequest,
    userId: string,
    hc: TrustedHeaderConfig,
  ): Promise<IdentityResult> {
    const sigHeader = hc.signatureHeader ?? DEFAULT_SIGNATURE_HEADER;
    const tsHeader = hc.timestampHeader ?? DEFAULT_TIMESTAMP_HEADER;
    const nonceHeader = hc.nonceHeader ?? DEFAULT_NONCE_HEADER;
    const secretEnv = hc.sharedSecretEnv ?? DEFAULT_SECRET_ENV;
    const maxSkew = hc.maxSkewSeconds ?? DEFAULT_MAX_SKEW;

    const signature = stringHeader(request, sigHeader);
    const timestamp = stringHeader(request, tsHeader);
    const nonce = stringHeader(request, nonceHeader);

    if (!signature || !timestamp || !nonce) {
      return sigError(`Signed headers required: ${sigHeader}, ${tsHeader}, ${nonceHeader}`);
    }

    // Clock skew check
    const ts = Number.parseInt(timestamp, 10);
    if (Number.isNaN(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > maxSkew) {
      return sigError('Timestamp out of range');
    }

    // HMAC verification
    const secret = process.env[secretEnv];
    if (!secret) return sigError(`Shared secret env ${secretEnv} not set`);

    const expected = createHmac('sha256', secret).update(`${userId}.${timestamp}.${nonce}`).digest('hex');
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
      return sigError('HMAC signature mismatch');
    }

    // Nonce replay check
    if (this.nonceStore) {
      const isReplay = await this.nonceStore.checkAndMark(nonce, maxSkew * 2);
      if (isReplay) {
        return { ok: false, error: { code: 'REPLAY_DETECTED', message: 'Nonce already used', statusCode: 403 } };
      }
    }

    return { ok: true, identity: { userId, mode: 'trusted-header', source: 'trusted-header' } };
  }

  private async resolveJwt(_request: FastifyRequest): Promise<IdentityResult> {
    // JWT mode is Phase 1 stretch / Phase 2.
    // Stub: returns error until implemented.
    return {
      ok: false,
      error: { code: 'JWT_INVALID', message: 'JWT mode not yet implemented', statusCode: 401 },
    };
  }
}

// ─── Helpers ──────────────────────────────────────────

function stringHeader(request: FastifyRequest, name: string): string | null {
  const val = request.headers[name];
  if (typeof val !== 'string') return null;
  const trimmed = val.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sigError(message: string): IdentityResult {
  return { ok: false, error: { code: 'INVALID_SIGNATURE', message, statusCode: 403 } };
}
