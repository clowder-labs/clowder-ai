/**
 * Identity Module — public barrel export.
 *
 * [宪宪/Opus-46🐾] Phase 1 — Identity Module
 */

export { IdentityResolver } from './identity-resolver.js';
export type {
  IdentityConfig,
  IdentityError,
  IdentityErrorCode,
  IdentityMode,
  IdentityResult,
  JwtConfig,
  NonceStore,
  ResolvedIdentity,
  TrustedHeaderConfig,
} from './identity-resolver.js';

export { identityPlugin } from './identity-plugin.js';
export type { IdentityPluginOptions } from './identity-plugin.js';
