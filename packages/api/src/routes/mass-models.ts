/**
 * Mass Models Routes — \u83b7\u53d6\u6240\u6709\u6a21\u578b\u5217\u8868
 */

import type { FastifyPluginAsync } from 'fastify';
import { readAcpModelProfiles } from '../config/acp-model-profiles.js';
import { readProviderProfiles } from '../config/provider-profiles.js';
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
      return { success: true, list: data.data.map((d: any) => ({ ...d, name: d.id, description: d.descriptionssss })) };
    } catch (error) {
      console.error('获取模型失败:', error);
      return { success: true, list: [] };
    }
  });

  app.get('/api/maas-send', async (request) => {
    const modelInfo: any = {};
    try {
      const modelResponse = await fetch(`https://${modelInfo.model_api_url_base}/v2/chart/completions`,{
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
      return { success: true, list: data.data };
    } catch (error) {
      console.error('获取模型失败:', error);
      return { success: true, list: [] };
    }
  });
};

function getAuthorization(modelInfo: any) {
  return Buffer.from(`${modelInfo.model_auth_info.model_app_key}:${modelInfo.model_auth_info.model_app_secret}`).toString('base64');
}