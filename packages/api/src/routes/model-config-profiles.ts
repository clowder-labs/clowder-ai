import type { FastifyPluginAsync } from 'fastify';
import { readProjectModelConfigProfileViews } from '../config/model-config-profiles.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import { type ProviderProfilesRoutesOptions } from './provider-profiles.shared.js';

export const modelConfigProfilesRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app) => {
  app.get('/api/model-config-profiles', async () => {
    const projectRoot = resolveActiveProjectRoot();
    const providers = await readProjectModelConfigProfileViews(projectRoot);
    return {
      projectPath: 'global',
      exists: providers !== null,
      providers: (providers ?? []).map((profile) => ({ ...profile, source: 'model_config' as const })),
    };
  });
};
