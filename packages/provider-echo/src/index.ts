/**
 * Echo Provider Plugin
 * Example @clowder/provider-* package that demonstrates the plugin contract.
 * Echoes back the user's prompt — useful for testing and as a template for custom providers.
 */

import type { CatId } from '@clowder/shared';
import type {
  AgentMessage,
  AgentService,
  AgentServiceOptions,
  ClowderProviderPlugin,
  AgentServiceFactoryContext,
} from '@clowder/core';

class EchoAgentService implements AgentService {
  private readonly catId: CatId;

  constructor(catId: CatId) {
    this.catId = catId;
  }

  async *invoke(prompt: string, options?: AgentServiceOptions): AsyncIterable<AgentMessage> {
    const sessionId = options?.sessionId ?? `echo-${Date.now()}`;
    const now = Date.now();

    yield {
      type: 'session_init',
      catId: this.catId,
      sessionId,
      timestamp: now,
    };

    yield {
      type: 'text',
      catId: this.catId,
      content: `[echo] ${prompt}`,
      metadata: { provider: 'echo', model: 'echo-v1' },
      timestamp: now + 1,
    };

    yield {
      type: 'done',
      catId: this.catId,
      isFinal: true,
      timestamp: now + 2,
    };
  }
}

const plugin: ClowderProviderPlugin = {
  name: 'echo',
  providers: ['echo'],

  createAgentService(ctx: AgentServiceFactoryContext): AgentService {
    return new EchoAgentService(ctx.catId);
  },
};

export default plugin;
