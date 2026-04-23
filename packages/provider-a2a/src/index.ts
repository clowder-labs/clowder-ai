/**
 * @office-claw/provider-a2a
 * Provider plugin for Google A2A protocol (remote JSON-RPC agents).
 */

import type { OfficeClawProviderPlugin, AgentServiceFactoryContext } from '@office-claw/core';
import type { AgentService } from '@office-claw/core';
import { A2AAgentService } from './A2AAgentService.js';

export { A2AAgentService } from './A2AAgentService.js';
export { transformA2ATaskToMessages, extractTextFromParts } from './a2a-event-transform.js';

const plugin: OfficeClawProviderPlugin = {
  name: 'a2a',
  providers: ['a2a'],

  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    const envKey = `CAT_${ctx.catId.toUpperCase()}_A2A_URL`;
    const a2aUrl = ctx.env[envKey] ?? '';
    if (!a2aUrl) {
      throw new Error(`A2A cat "${ctx.catId}" missing ${envKey} env var`);
    }
    return new A2AAgentService({ catId: ctx.catId, config: { url: a2aUrl } });
  },
};

export default plugin;
