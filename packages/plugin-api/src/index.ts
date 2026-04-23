/**
 * @office-claw/plugin-api — Unified plugin contracts for OfficeClaw extensions.
 *
 * Auth is the first extension point. Future extension points
 * (connector, workflow, memory) will be added as subpath exports.
 *
 * Usage:
 *   import type { AuthProvider } from '@office-claw/plugin-api/auth';
 *   // or
 *   import type { AuthProvider } from '@office-claw/plugin-api';
 */
export type {
  AuthenticateFailure,
  AuthenticateInput,
  AuthenticateOutcome,
  AuthenticateResult,
  AuthFieldOption,
  AuthFieldSchema,
  AuthPresentation,
  AuthPresentationMode,
  AuthProvider,
  AuthSessionInfo,
  ExternalPrincipal,
} from './auth.js';
