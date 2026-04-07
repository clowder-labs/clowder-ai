/**
 * Edition Registration API — barrel re-export of all registerEdition* functions.
 *
 * Edition modules import from here to register vendor-specific extensions.
 * Core defines the functions; Edition calls them at startup.
 */

// Connector bootstrap — vendor adapter plugins
export {
  registerEditionConnectorPlugin,
  type EditionConnectorPlugin,
  type EditionConnectorPluginDeps,
} from '../infrastructure/connectors/connector-gateway-bootstrap.js';

// Connector hub — vendor platform definitions for the UI
export { registerEditionConnectorPlatform } from '../routes/connector-hub.js';

// Agent sidecar paths — vendor executable/directory config
export { registerEditionSidecarPaths, type SidecarPathConfig } from '../utils/agent-sidecar-paths.js';

// Version checker — vendor-specific update check
export { registerEditionVersionChecker, type EditionVersionInfo } from '../routes/version.js';

// Model config policy — vendor model source rules
export { setModelConfigPolicy } from '../config/model-config-profiles.js';

// Dare agent — vendor adapter env var mappings
export { registerEditionDareAdapters } from '../domains/cats/services/agents/providers/DareAgentService.js';

// Context window sizes — vendor model context windows
export { registerContextWindowSizes } from '../config/context-window-sizes.js';

// Env vars — vendor env var definitions
export { registerEditionEnvVars } from '../config/env-registry.js';

// Shared: cats + connector definitions
export { registerEditionCats, registerEditionConnectorDefinitions } from '@cat-cafe/shared/types';
