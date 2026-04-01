import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  createProjectModelConfigSource,
  deleteProjectModelConfigSource,
  isModelConfigProviderFallbackEnabled,
  readProjectModelConfigProfileViews,
} from '../config/model-config-profiles.js';
import { resolveActiveProjectRoot } from '../utils/active-project-root.js';
import {
  type ProviderProfilesRoutesOptions,
  projectQuerySchema,
  resolveProjectRoot,
} from './provider-profiles.shared.js';

const createModelConfigSourceBodySchema = z.object({
  projectPath: z.string().optional(),
  sourceId: z.string().trim().min(1),
  displayName: z.string().trim().min(1).optional(),
  baseUrl: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  headers: z.record(z.string().trim().min(1), z.string().trim().min(1)).optional(),
  models: z.array(z.string().trim().min(1)).min(1),
});

export const modelConfigProfilesRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app) => {
  app.get('/api/model-config-profiles', async (request, reply) => {
    const parsed = projectQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parsed.error.issues };
    }
    const projectRoot = parsed.data.projectPath
      ? await resolveProjectRoot(parsed.data.projectPath)
      : resolveActiveProjectRoot();
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }
    const providers = await readProjectModelConfigProfileViews(projectRoot);
    return {
      projectPath: 'global',
      fallbackToProviderProfiles: isModelConfigProviderFallbackEnabled(),
      exists: providers !== null,
      providers: (providers ?? []).map((profile) => ({ ...profile, source: 'model_config' as const })),
    };
  });

  app.post('/api/model-config-profiles', async (request, reply) => {
    const parsed = createModelConfigSourceBodySchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid body', details: parsed.error.issues };
    }

    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    try {
      const created = await createProjectModelConfigSource(projectRoot, {
        id: parsed.data.sourceId,
        ...(parsed.data.displayName ? { displayName: parsed.data.displayName } : {}),
        baseUrl: parsed.data.baseUrl,
        apiKey: parsed.data.apiKey,
        ...(parsed.data.headers ? { headers: parsed.data.headers } : {}),
        models: parsed.data.models,
      });

      reply.status(201);
      return {
        provider: {
          id: created.id,
          provider: created.id,
          displayName: created.displayName?.trim() || created.id,
          name: created.displayName?.trim() || created.id,
          authType: 'api_key',
          kind: 'api_key',
          builtin: false,
          mode: 'api_key',
          protocol: 'openai',
          models: created.models,
          hasApiKey: true,
          source: 'model_config' as const,
        },
      };
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });

  app.delete('/api/model-config-profiles/:sourceId', async (request, reply) => {
    const params = z.object({ sourceId: z.string().trim().min(1) }).safeParse(request.params);
    if (!params.success) {
      reply.status(400);
      return { error: 'Invalid params', details: params.error.issues };
    }

    const parsed = projectQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parsed.error.issues };
    }

    const projectRoot = parsed.data.projectPath
      ? await resolveProjectRoot(parsed.data.projectPath)
      : resolveActiveProjectRoot();
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    try {
      const deleted = await deleteProjectModelConfigSource(projectRoot, params.data.sourceId);
      if (!deleted) {
        reply.status(404);
        return { error: `model config source "${params.data.sourceId}" not found` };
      }
      return { success: true };
    } catch (error) {
      reply.status(400);
      return { error: error instanceof Error ? error.message : String(error) };
    }
  });
};
