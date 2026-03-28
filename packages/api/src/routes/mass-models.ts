/**
 * Mass Models Routes — 聚合当前已配置的模型列表
 */

import type { FastifyPluginAsync } from 'fastify';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { readAcpModelProfiles } from '../config/acp-model-profiles.js';
import { HUAWEI_MAAS_MODEL_SOURCE_ID, resolveProjectModelConfigPath } from '../config/model-config-profiles.js';
import { readProviderProfiles } from '../config/provider-profiles.js';
import { resolveHuaweiMaaSRuntimeConfig } from '../integrations/huawei-maas.js';
import { resolveUserId } from '../utils/request-identity.js';
import {
  type ProviderProfilesRoutesOptions,
  projectQuerySchema,
  resolveProjectRoot,
} from './provider-profiles.shared.js';

export interface MassModelInfo {
  id: string;
  name: string;
  provider: string;
  kind: 'provider' | 'acp';
  protocol?: string;
  enabled: boolean;
  description?: string;
}

export interface MassModelsResponse {
  projectPath: string;
  models: MassModelInfo[];
}

function normalizeModelList(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null);
  }
  return [];
}

function uniqueById(models: MassModelInfo[]): MassModelInfo[] {
  const seen = new Set<string>();
  return models.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function uniquePayloadById(models: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const seen = new Set<string>();
  return models.filter((item, index) => {
    const rawId = item.id;
    const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : `index:${index}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function toMassModelList(models: Array<Record<string, unknown>>): MassModelInfo[] {
  return models.map((item, index) => {
    const rawId = item.id;
    const rawName = item.name;
    const rawDescription = item.description ?? item.descriptionssss ?? item.desc;
    const id = typeof rawId === 'string' && rawId.trim() ? rawId.trim() : `maas:${index}`;
    const name =
      typeof rawName === 'string' && rawName.trim()
        ? rawName.trim()
        : typeof rawId === 'string' && rawId.trim()
          ? rawId.trim()
          : id;
    return {
      ...item,
      id,
      name,
      provider: 'Huawei MaaS',
      kind: 'provider',
      protocol: 'huawei_maas',
      enabled: true,
      ...(typeof rawDescription === 'string' && rawDescription.trim()
        ? { description: rawDescription.trim() }
        : {}),
    } satisfies MassModelInfo;
  });
}

async function readCachedMaaSModels(modelJsonPath: string): Promise<Array<Record<string, unknown>>> {
  const modelJsonRaw = await readFile(modelJsonPath, 'utf-8');
  if (!modelJsonRaw.trim()) return [];
  const parsed = JSON.parse(modelJsonRaw) as Record<string, unknown>;
  return normalizeModelList(parsed[HUAWEI_MAAS_MODEL_SOURCE_ID]);
}

async function readCachedModelConfig(modelJsonPath: string): Promise<Record<string, unknown>> {
  const modelJsonRaw = await readFile(modelJsonPath, 'utf-8');
  if (!modelJsonRaw.trim()) return {};
  const parsed = JSON.parse(modelJsonRaw) as unknown;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? { ...(parsed as Record<string, unknown>) }
    : {};
}

async function aggregateConfiguredModels(projectRoot: string): Promise<MassModelsResponse> {
  const [providerProfiles, acpModelProfiles] = await Promise.all([
    readProviderProfiles(projectRoot),
    readAcpModelProfiles(projectRoot),
  ]);

  const providerModels = providerProfiles.providers.flatMap((profile) =>
    (profile.models ?? []).map((modelName) => ({
      id: `provider:${profile.id}:${modelName}`,
      name: modelName,
      provider: profile.displayName,
      kind: 'provider' as const,
      ...(profile.protocol ? { protocol: profile.protocol } : {}),
      enabled: true,
      description: `来自 ${profile.displayName}`,
    })),
  );

  const acpModels = acpModelProfiles.profiles.map((profile) => ({
    id: `acp:${profile.id}:${profile.model}`,
    name: profile.model,
    provider: profile.displayName,
    kind: 'acp' as const,
    ...(profile.provider ? { protocol: profile.provider } : {}),
    enabled: true,
    description: `ACP Model Profile · ${profile.displayName}`,
  }));

  return {
    projectPath: projectRoot,
    models: uniqueById([...providerModels, ...acpModels]),
  };
}

export const massModelsRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app, opts) => {
  const fetchImpl = opts.fetchImpl ?? fetch;

  app.get('/api/mass-models', async (request, reply) => {
    const parsed = projectQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      reply.status(400);
      return { error: 'Invalid query', details: parsed.error.issues };
    }

    const projectRoot = await resolveProjectRoot(parsed.data.projectPath);
    if (!projectRoot) {
      reply.status(400);
      return { error: 'Invalid project path: must be an existing directory under allowed roots' };
    }

    const modelJsonPath = resolveProjectModelConfigPath(projectRoot);
    try {
      const cachedModels = await readCachedMaaSModels(modelJsonPath);
      if (cachedModels.length > 0) {
        return { success: true, list: toMassModelList(cachedModels), projectPath: projectRoot };
      }
    } catch (readError) {
      if ((readError as { code?: string })?.code !== 'ENOENT') {
        console.warn('读取 model.json 失败，继续调用远程接口:', readError);
      }
    }

    const userId = resolveUserId(request);
    if (userId) {
      try {
        const runtimeConfig = resolveHuaweiMaaSRuntimeConfig(userId);
        const modelResponse = await fetchImpl(`${runtimeConfig.baseUrl}/models`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json;charset=utf8',
            ...runtimeConfig.defaultHeaders,
          },
        });

        if (!modelResponse.ok) {
          throw new Error(`${modelResponse.status}`);
        }

        const data = (await modelResponse.json()) as Record<string, unknown>;
        const incomingModels = normalizeModelList(data.data);
        let existingModels: Array<Record<string, unknown>> = [];

        await mkdir(dirname(modelJsonPath), { recursive: true });
        let existingConfig: Record<string, unknown> = {};
        try {
          existingConfig = await readCachedModelConfig(modelJsonPath);
          existingModels = await readCachedMaaSModels(modelJsonPath);
        } catch (readError) {
          if ((readError as { code?: string })?.code !== 'ENOENT') {
            console.warn('读取 model.json 失败，将以新数据继续写入:', readError);
          }
        }

        const mergedModels = uniquePayloadById([...existingModels, ...incomingModels]);
        await writeFile(
          modelJsonPath,
          `${JSON.stringify({ ...existingConfig, [HUAWEI_MAAS_MODEL_SOURCE_ID]: mergedModels }, null, 2)}\n`,
          'utf-8',
        );
        return { success: true, list: toMassModelList(incomingModels), projectPath: projectRoot };
      } catch (error) {
        console.error('获取 Huawei MaaS 模型失败，将回退到本地聚合模型列表:', error);
      }
    }

    return await aggregateConfiguredModels(projectRoot);
  });

  app.post('/api/maas-send', async (_request, reply) => {
    reply.status(410);
    return {
      error: 'Clowder no longer proxies Huawei MaaS model calls. Runtime auth is passed to downstream agents.',
    };
  });
};
