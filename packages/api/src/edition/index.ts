/**
 * Edition Module — public barrel export.
 *
 * Import from '@cat-cafe/api/edition' (or '../edition/index.js')
 * to get the Edition system's types, loader, and constants.
 *
 * [宪宪/Opus-46🐾] Phase 1 — Edition Module
 */

export { CORE_API_VERSION, DEFAULT_EDITION, loadEdition } from './edition-loader.js';
export type { LoadEditionOptions } from './edition-loader.js';

export { EditionRegistryImpl } from './types.js';
export type {
  BrandingConfig,
  CapabilityManifest,
  ConnectorCapabilities,
  ConnectorConfig,
  EditionConfig,
  EditionRegistry,
  IConnectorAdapter,
  IEditionModule,
  IModelSource,
  ISkillSource,
  InboundEvent,
  ModelEntry,
  OutboundMessage,
  RuntimeModelConfig,
  SkillSearchResult,
} from './types.js';
