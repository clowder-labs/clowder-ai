/**
 * Mass Models Routes — \u83b7\u53d6\u6240\u6709\u6a21\u578b\u5217\u8868
 */

import type { FastifyPluginAsync } from 'fastify';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readAcpModelProfiles } from '../config/acp-model-profiles.js';
import { readProviderProfiles } from '../config/provider-profiles.js';
import { findMonorepoRoot } from '../utils/monorepo-root.js';
import { resolveUserId } from '../utils/request-identity.js';
import {
  type ProviderProfilesRoutesOptions,
  projectQuerySchema,
  resolveProjectRoot,
} from './provider-profiles.shared.js';
import { sessions } from './auth.js';

export interface MassModelInfo {
  id: string;
  name: string;
  provider: string;
  kind: 'provider' | 'acp';
  protocol?: string;
  enabled: boolean;
}

export interface MassModelsResponse {
  projectPath: string;
  models: MassModelInfo[];
}

export const massModelsRoutes: FastifyPluginAsync<ProviderProfilesRoutesOptions> = async (app) => {
  app.get('/api/mass-models', async (request) => {
    const userId = request.headers['x-cat-cafe-user'] as string;
    const modelInfo:any = sessions.get(userId)?.modelInfo || {};
    const projectRoot = findMonorepoRoot();
    const configDir = join(projectRoot, 'config');
    const modelJsonPath = join(configDir, 'model.json');

    try {
      const modelJsonRaw = await readFile(modelJsonPath, 'utf-8');
      if (modelJsonRaw.trim()) {
        const parsed = JSON.parse(modelJsonRaw);
        const cachedModels = normalizeModelList(parsed?.['maas-data']);
        if (cachedModels.length > 0) {
          return { success: true, list: toMassModelList(cachedModels) };
        }
      }
    } catch (readError) {
      if ((readError as { code?: string })?.code !== 'ENOENT') {
        console.warn('读取 model.json 失败，继续调用远程接口:', readError);
      }
    }

    console.log('modelInfo', modelInfo);
    // 调用华为云认证接口
    try {
      const modelResponse = await fetch(`https://${modelInfo.model_api_url_base}/v2/models`,{
        method: 'GET',
        headers: {
          'Content-Type': 'application/json;charset=utf8',
          'Authorization': `Basic ${getAuthorization(modelInfo)}`
        },
      });

      if (!modelResponse.ok) {
        throw new Error(`${modelResponse.status}`);
      }
      const data: any = await modelResponse.json();
      const incomingModels = normalizeModelList(data.data);
      let existingModels: any[] = [];

      await mkdir(configDir, { recursive: true });
      try {
        const modelJsonRaw = await readFile(modelJsonPath, 'utf-8');
        if (modelJsonRaw.trim()) {
          const parsed = JSON.parse(modelJsonRaw);
          existingModels = normalizeModelList(parsed?.['maas-data']);
        }
      } catch (readError) {
        if ((readError as { code?: string })?.code !== 'ENOENT') {
          console.warn('读取 model.json 失败，将以新数据继续写入:', readError);
        }
      }

      await writeFile(
        modelJsonPath,
        `${JSON.stringify({ 'maas-data': [...existingModels, ...incomingModels] }, null, 2)}\n`,
        'utf-8',
      );
      return { success: true, list: toMassModelList(incomingModels) };
    } catch (error) {
      console.error('获取模型失败:', error);
      return { success: true, list: [] };
    }
  });

  app.get('/api/maas-send', async (request) => {
    const userId = request.headers['x-cat-cafe-user'] as string;
    const modelInfo:any = sessions.get(userId)?.modelInfo || {};
    try {
      const modelResponse = await fetch(`https://${modelInfo.model_api_url_base}/v2/chat/completions`,{
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf8',
          'Authorization': `Basic ${getAuthorization(modelInfo)}`
        },
        body: JSON.stringify(request.body)
      });

      if (!modelResponse.ok) {
        throw new Error(`${modelResponse.status}`);
      }
      const data: any = await modelResponse.json();
      return data;
    } catch (error) {
      console.error('获取模型失败:', error);
      return { success: true, list: [] };
    }
  });
};

function getAuthorization(modelInfo: any) {
  return Buffer.from(`${modelInfo.model_auth_info.model_app_key}:${modelInfo.model_auth_info.model_app_secret}`).toString('base64');
}

function normalizeModelList(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined) return [];
  return [value];
}

function toMassModelList(models: any[]): any[] {
  return models.map((d: any) => ({ ...d, name: d.id, description: d.descriptionssss }));
}
