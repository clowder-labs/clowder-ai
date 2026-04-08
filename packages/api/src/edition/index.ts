/**
 * Edition Module — public barrel export.
 *
 * Import from '@cat-cafe/api/edition' (or '../edition/index.js')
 * to get the Edition system's types, loader, and constants.
 *
 * [宪宪/Opus-46🐾] Phase 1 — Edition Module
 */

export type { LoadEditionOptions } from './edition-loader.js';
export { CORE_API_VERSION, DEFAULT_EDITION, loadEdition } from './edition-loader.js';
export type {
  EditionConnectorPlugin,
  EditionConnectorPluginDeps,
  EditionVersionInfo,
  SidecarPathConfig,
} from './registration-api.js';
// Registration API — Edition modules import from here to register extensions
export {
  registerContextWindowSizes,
  registerEditionCats,
  registerEditionConnectorDefinitions,
  registerEditionConnectorPlatform,
  registerEditionConnectorPlugin,
  registerEditionDareAdapters,
  registerEditionEnvVars,
  registerEditionSidecarPaths,
  registerEditionVersionChecker,
  setModelConfigPolicy,
} from './registration-api.js';
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
  InboundEvent,
  ISkillSource,
  ModelConfigPolicy,
  ModelEntry,
  ModelSourceProtocolRule,
  OutboundMessage,
  RuntimeModelConfig,
  SkillSearchResult,
} from './types.js';
export { DEFAULT_MODEL_CONFIG_POLICY, EditionRegistryImpl } from './types.js';
