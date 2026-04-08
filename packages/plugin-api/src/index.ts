/**
 * @cat-cafe/plugin-api — Unified plugin contracts for Cat Cafe extensions.
 *
 * Auth is the first extension point. Future extension points
 * (connector, workflow, memory) will be added as subpath exports.
 *
 * Usage:
 *   import type { AuthProvider } from '@cat-cafe/plugin-api/auth';
 *   // or
 *   import type { AuthProvider } from '@cat-cafe/plugin-api';
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
