import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { applyConnectorSecretUpdates } from '../config/connector-secret-updater.js';
import { DEFAULT_THREAD_ID, type IThreadStore } from '../domains/cats/services/stores/ports/ThreadStore.js';
import type { WeixinAdapter } from '../infrastructure/connectors/adapters/WeixinAdapter.js';
import type { IConnectorPermissionStore } from '../infrastructure/connectors/ConnectorPermissionStore.js';
import { DefaultFeishuQrBindClient, type FeishuQrBindClient } from '../infrastructure/connectors/FeishuQrBindClient.js';
import { resolveHeaderUserId } from '../utils/request-identity.js';

export interface ConnectorHubRoutesOptions {
  threadStore: IThreadStore;
  /**
   * Lazy reference to the WeChat adapter instance.
   * Set after connector gateway starts (which happens post-listen).
   * Null when gateway not started or WeChat not available.
   */
  weixinAdapter?: WeixinAdapter | null;
  /** Called after successful QR login to start the WeChat polling loop */
  startWeixinPolling?: () => void;
  /** Persist + activate a newly acquired WeChat bot token */
  activateWeixinBotToken?: (token: string) => Promise<void> | void;
  /** Clear active WeChat bot token and persisted local session */
  disconnectWeixinBotToken?: () => Promise<void> | void;
  /** F134 Phase D: Permission store for group whitelist + admin management */
  permissionStore?: IConnectorPermissionStore | null;
  envFilePath?: string;
  feishuQrBindClient?: FeishuQrBindClient;
}

function requireTrustedHubIdentity(request: FastifyRequest, reply: FastifyReply): string | null {
  const userId = resolveHeaderUserId(request);
  if (!userId) {
    reply.status(401);
    return null;
  }
  return userId;
}

// ── Connector platform config definitions ──

interface ConnectorFieldDef {
  envName: string;
  label: string;
  sensitive: boolean;
  /** When set, this field is only required if the condition env var has the given value */
  requiredWhen?: { envName: string; value: string };
  /** When true, this field is never required for the platform to be "configured" */
  optional?: boolean;
  /** Default value used when the env var is not set — aligns status page with runtime normalization */
  defaultValue?: string;
}

interface PlatformStepDef {
  text: string;
  /** When set, this step only displays when the selected connection mode matches */
  mode?: string;
}

interface PlatformDef {
  id: string;
  name: string;
  nameEn: string;
  fields: ConnectorFieldDef[];
  docsUrl: string;
  /** Steps displayed in the guided wizard — may be mode-filtered */
  steps: PlatformStepDef[];
}

export function normalizeFeishuConnectionMode(value: string | undefined): 'webhook' | 'websocket' {
  return value === 'websocket' ? 'websocket' : 'webhook';
}

export const CONNECTOR_PLATFORMS: PlatformDef[] = [
  {
    id: 'feishu',
    name: '飞书',
    nameEn: 'Feishu / Lark',
    fields: [
      { envName: 'FEISHU_APP_ID', label: 'App ID', sensitive: false },
      { envName: 'FEISHU_APP_SECRET', label: 'App Secret', sensitive: true },
      {
        envName: 'FEISHU_CONNECTION_MODE',
        label: '连接模式 (webhook/websocket)',
        sensitive: false,
        optional: true,
        defaultValue: 'webhook',
      },
      {
        envName: 'FEISHU_VERIFICATION_TOKEN',
        label: 'Verification Token',
        sensitive: true,
        requiredWhen: { envName: 'FEISHU_CONNECTION_MODE', value: 'webhook' },
      },
    ],
    docsUrl:
      'https://open.feishu.cn/document/home/introduction-to-custom-app-development/self-built-application-development-process',
    steps: [
      { text: '在飞书开放平台创建企业自建应用，获取 App ID 和 App Secret' },
      { text: '选择连接模式：Webhook（需公网 URL）或 WebSocket（无需公网，推荐内网环境）' },
      { text: '在「事件订阅」中配置请求地址并获取 Verification Token', mode: 'webhook' },
      { text: '在「事件订阅」中选择「使用长连接接收事件」，无需 Verification Token', mode: 'websocket' },
      { text: '填写以下配置并保存，重启 API 服务后生效' },
    ],
  },
  {
    id: 'weixin',
    name: '微信',
    nameEn: 'WeChat Personal',
    fields: [],
    docsUrl: 'https://chatbot.weixin.qq.com/',
    steps: [
      { text: '点击「生成二维码」按钮' },
      { text: '使用微信扫描二维码并确认授权' },
      { text: '授权成功后自动连接，无需重启服务' },
    ],
  },
  {
    id: 'dingtalk',
    name: '钉钉',
    nameEn: 'DingTalk',
    fields: [
      { envName: 'DINGTALK_APP_KEY', label: 'App Key', sensitive: false },
      { envName: 'DINGTALK_APP_SECRET', label: 'App Secret', sensitive: true },
    ],
    docsUrl: 'https://open.dingtalk.com/document/orgapp/create-an-enterprise-internal-application',
    steps: [
      { text: '在钉钉开放平台创建企业内部应用，获取 App Key 和 App Secret' },
      { text: '在「机器人与消息推送」中开启机器人能力' },
      { text: '填写以下配置并保存，重启 API 服务后生效' },
    ],
  },
  {
    id: 'xiaoyi',
    name: '小艺',
    nameEn: 'Huawei XiaoYi',
    fields: [
      { envName: 'XIAOYI_AGENT_ID', label: 'Agent ID', sensitive: false },
      { envName: 'XIAOYI_AK', label: 'Access Key (AK)', sensitive: true },
      { envName: 'XIAOYI_SK', label: 'Secret Key (SK)', sensitive: true },
    ],
    docsUrl: 'https://developer.huawei.com/consumer/cn/hag/abilityportal/',
    steps: [
      { text: '在华为小艺开放平台创建智能体，新建凭证获取 AK / SK' },
      { text: '配置白名单分组，添加调试用华为账号' },
      { text: '填写以下配置并保存，重启 API 服务后生效' },
    ],
  },
];

/** Mask a sensitive value: show only that it is set, no suffix. Aligns with env-registry *** policy. */
function maskSensitiveValue(_value: string): string {
  return '••••••••';
}

export interface PlatformFieldStatus {
  envName: string;
  label: string;
  sensitive: boolean;
  /** null = not set, masked string = set (sensitive fields show last 4 chars) */
  currentValue: string | null;
}

export interface PlatformStepStatus {
  text: string;
  mode?: string;
}

export interface PlatformStatus {
  id: string;
  name: string;
  nameEn: string;
  configured: boolean;
  fields: PlatformFieldStatus[];
  docsUrl: string;
  steps: PlatformStepStatus[];
}

export function buildConnectorStatus(env: Record<string, string | undefined> = process.env): PlatformStatus[] {
  return CONNECTOR_PLATFORMS.map((platform) => {
    const fields: PlatformFieldStatus[] = platform.fields.map((f) => {
      const raw = env[f.envName];
      const isSet = raw != null && raw !== '' && !raw.startsWith('(未设置');
      const effectiveValue = isSet ? raw : (f.defaultValue ?? null);
      return {
        envName: f.envName,
        label: f.label,
        sensitive: f.sensitive,
        currentValue: effectiveValue ? (f.sensitive ? maskSensitiveValue(effectiveValue) : effectiveValue) : null,
      };
    });

    let configured: boolean;
    if (platform.fields.length === 0) {
      configured = false;
    } else {
      configured = platform.fields.every((f) => {
        if (f.optional) return true;
        if (f.requiredWhen) {
          const rawCondition = env[f.requiredWhen.envName];
          const conditionValue = normalizeFeishuConnectionMode(rawCondition);
          if (conditionValue !== f.requiredWhen.value) return true;
        }
        const raw = env[f.envName];
        return raw != null && raw !== '' && !raw.startsWith('(未设置');
      });
    }

    return {
      id: platform.id,
      name: platform.name,
      nameEn: platform.nameEn,
      configured,
      fields,
      docsUrl: platform.docsUrl,
      steps: platform.steps,
    };
  });
}

export const connectorHubRoutes: FastifyPluginAsync<ConnectorHubRoutesOptions> = async (app, opts) => {
  const { threadStore } = opts;
  const feishuQrBindClient = opts.feishuQrBindClient ?? new DefaultFeishuQrBindClient();

  app.get('/api/connector/hub-threads', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }
    const allThreads = await threadStore.list(userId);
    const hubThreads = allThreads
      .filter((t) => t.connectorHubState && t.id !== DEFAULT_THREAD_ID)
      .sort((a, b) => (b.connectorHubState?.createdAt ?? 0) - (a.connectorHubState?.createdAt ?? 0));
    return {
      threads: hubThreads.map((t) => ({
        id: t.id,
        title: t.title,
        connectorId: t.connectorHubState?.connectorId,
        externalChatId: t.connectorHubState?.externalChatId,
        createdAt: t.connectorHubState?.createdAt,
        lastCommandAt: t.connectorHubState?.lastCommandAt,
      })),
    };
  });

  app.get('/api/connector/status', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }
    const status = buildConnectorStatus();
    // F137: WeChat "configured" is based on adapter having a live bot_token, not env vars
    const weixinStatus = status.find((p) => p.id === 'weixin');
    if (weixinStatus) {
      const adapter = opts.weixinAdapter;
      weixinStatus.configured = adapter != null && adapter.hasBotToken() && adapter.isPolling();
    }
    return { platforms: status };
  });

  app.post('/api/connector/test/feishu', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const readInput = (key: string): string | undefined => {
      const value = body[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const readEnv = (key: string): string | undefined => {
      const value = process.env[key];
      return value && !value.startsWith('(未设置') ? value : undefined;
    };

    const appId = readInput('FEISHU_APP_ID') ?? readEnv('FEISHU_APP_ID');
    const appSecret = readInput('FEISHU_APP_SECRET') ?? readEnv('FEISHU_APP_SECRET');
    const connectionMode = normalizeFeishuConnectionMode(
      readInput('FEISHU_CONNECTION_MODE') ?? readEnv('FEISHU_CONNECTION_MODE'),
    );
    const verificationToken = readInput('FEISHU_VERIFICATION_TOKEN') ?? readEnv('FEISHU_VERIFICATION_TOKEN');

    if (!appId || !appSecret) {
      reply.status(400);
      return { ok: false, error: '缺少 FEISHU_APP_ID 或 FEISHU_APP_SECRET' };
    }

    try {
      const { FeishuTokenManager } = await import('../infrastructure/connectors/adapters/FeishuTokenManager.js');
      const tokenManager = new FeishuTokenManager({ appId, appSecret });
      const tenantAccessToken = await tokenManager.getTenantAccessToken();

      const botInfoRes = await fetch('https://open.feishu.cn/open-apis/bot/v3/info', {
        headers: { Authorization: `Bearer ${tenantAccessToken}` },
      });
      const botInfoData = (await botInfoRes.json().catch(() => ({}))) as {
        code?: number;
        msg?: string;
        bot?: { open_id?: string; name?: string; app_name?: string };
      };

      if (!botInfoRes.ok || botInfoData.code) {
        reply.status(502);
        return {
          ok: false,
          error: '获取机器人信息失败，请确认已在飞书开放平台开启机器人能力',
          details: botInfoData.msg ?? `HTTP ${botInfoRes.status}`,
        };
      }

      const warnings: string[] = [];
      if (connectionMode === 'webhook' && !verificationToken) {
        warnings.push('当前为 webhook 模式，但未提供 Verification Token；事件订阅仍无法完成。');
      }

      return {
        ok: true,
        message: '飞书应用认证成功，机器人信息可访问。',
        connectionMode,
        warnings,
        bot: {
          openId: botInfoData.bot?.open_id ?? null,
          name: botInfoData.bot?.name ?? botInfoData.bot?.app_name ?? null,
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      reply.status(502);
      return {
        ok: false,
        error: '飞书连接测试失败，请检查 App ID / App Secret 是否正确',
        details: message,
      };
    }
  });

  // ── Feishu QR code login routes ──

  app.post('/api/connector/feishu/qrcode', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };

    try {
      const result = await feishuQrBindClient.create();
      return result;
    } catch (err) {
      app.log.error({ err }, '[Feishu QR] Failed to fetch QR code');
      reply.status(502);
      return { error: 'Failed to fetch QR code from Feishu registration service' };
    }
  });

  app.get('/api/connector/feishu/qrcode-status', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };

    const { qrPayload } = request.query as { qrPayload?: string };
    if (!qrPayload) {
      reply.status(400);
      return { error: 'qrPayload query parameter required' };
    }

    try {
      const status = await feishuQrBindClient.poll(qrPayload);
      if (status.status !== 'confirmed') {
        return status;
      }

      const updates = [
        { name: 'FEISHU_APP_ID', value: status.appId ?? null },
        { name: 'FEISHU_APP_SECRET', value: status.appSecret ?? null },
      ];
      const currentMode = process.env.FEISHU_CONNECTION_MODE === 'websocket' ? 'websocket' : 'webhook';
      const verificationToken = process.env.FEISHU_VERIFICATION_TOKEN;
      if (currentMode === 'webhook' && (!verificationToken || verificationToken.trim() === '')) {
        updates.push({ name: 'FEISHU_CONNECTION_MODE', value: 'websocket' });
      }
      await applyConnectorSecretUpdates(updates, { envFilePath: opts.envFilePath });
      return { status: 'confirmed' };
    } catch (err) {
      app.log.error({ err }, '[Feishu QR] Failed to poll QR status');
      reply.status(502);
      return { error: 'Failed to poll Feishu QR status' };
    }
  });

  app.post('/api/connector/feishu/disconnect', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };

    await applyConnectorSecretUpdates(
      [
        { name: 'FEISHU_APP_ID', value: null },
        { name: 'FEISHU_APP_SECRET', value: null },
      ],
      { envFilePath: opts.envFilePath },
    );
    app.log.info({ userId }, '[Feishu] Disconnected by user');
    return { ok: true };
  });

  // ── DingTalk connectivity test ──

  app.post('/api/connector/test/dingtalk', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const readInput = (key: string): string | undefined => {
      const value = body[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const readEnv = (key: string): string | undefined => {
      const value = process.env[key];
      return value && !value.startsWith('(未设置') ? value : undefined;
    };

    const appKey = readInput('DINGTALK_APP_KEY') ?? readEnv('DINGTALK_APP_KEY');
    const appSecret = readInput('DINGTALK_APP_SECRET') ?? readEnv('DINGTALK_APP_SECRET');

    if (!appKey || !appSecret) {
      reply.status(400);
      return { ok: false, error: '缺少 DINGTALK_APP_KEY 或 DINGTALK_APP_SECRET' };
    }

    try {
      const tokenRes = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, appSecret }),
      });

      const tokenData = (await tokenRes.json().catch(() => ({}))) as {
        accessToken?: string;
        expireIn?: number;
        code?: string;
        message?: string;
      };

      if (!tokenRes.ok || !tokenData.accessToken) {
        reply.status(502);
        return {
          ok: false,
          error: '钉钉认证失败，请确认 App Key / App Secret 是否正确',
          details: tokenData.message ?? `HTTP ${tokenRes.status}`,
        };
      }

      return {
        ok: true,
        message: '钉钉应用认证成功，AccessToken 可正常获取。',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      reply.status(502);
      return {
        ok: false,
        error: '钉钉连接测试失败，请检查网络或 App Key / App Secret',
        details: message,
      };
    }
  });

  // ── XiaoYi connectivity test ──

  app.post('/api/connector/test/xiaoyi', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) {
      return { error: 'Identity required (X-Cat-Cafe-User header)' };
    }

    const body = (request.body ?? {}) as Record<string, unknown>;
    const readInput = (key: string): string | undefined => {
      const value = body[key];
      return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    const readEnv = (key: string): string | undefined => {
      const value = process.env[key];
      return value && !value.startsWith('(未设置') ? value : undefined;
    };

    const ak = readInput('XIAOYI_AK') ?? readEnv('XIAOYI_AK');
    const sk = readInput('XIAOYI_SK') ?? readEnv('XIAOYI_SK');
    const agentId = readInput('XIAOYI_AGENT_ID') ?? readEnv('XIAOYI_AGENT_ID');

    if (!ak || !sk || !agentId) {
      reply.status(400);
      return { ok: false, error: '缺少 XIAOYI_AK、XIAOYI_SK 或 XIAOYI_AGENT_ID' };
    }

    try {
      const { generateXiaoyiSignature } = await import(
        '../infrastructure/connectors/adapters/XiaoyiAdapter.js'
      );

      const timestamp = Date.now().toString();
      const signature = generateXiaoyiSignature(sk, timestamp);

      const wsUrl = readInput('XIAOYI_WS_URL1') ?? readEnv('XIAOYI_WS_URL1')
        ?? 'wss://hag.cloud.huawei.com/openclaw/v1/ws/link';

      const { WebSocket } = await import('ws');

      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          ws.close();
          resolve({ ok: false, error: 'WebSocket 握手超时（5秒）' });
        }, 5_000);

        const ws = new WebSocket(wsUrl, {
          headers: {
            'x-access-key': ak,
            'x-sign': signature,
            'x-ts': timestamp,
            'x-agent-id': agentId,
          },
        });

        ws.on('open', () => {
          clearTimeout(timeout);
          ws.close();
          resolve({ ok: true });
        });

        ws.on('error', (err: Error) => {
          clearTimeout(timeout);
          resolve({ ok: false, error: err.message });
        });
      });

      if (!result.ok) {
        reply.status(502);
        return {
          ok: false,
          error: '小艺平台连接测试失败，请检查 AK / SK / Agent ID',
          details: result.error,
        };
      }

      return {
        ok: true,
        message: '小艺平台 WebSocket 握手成功，凭据有效。',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      reply.status(502);
      return {
        ok: false,
        error: '小艺连接测试失败，请检查 AK / SK / Agent ID',
        details: message,
      };
    }
  });

  // ── F137: WeChat QR code login routes ──

  app.post('/api/connector/weixin/qrcode', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };

    try {
      const { WeixinAdapter: WA } = await import('../infrastructure/connectors/adapters/WeixinAdapter.js');
      const result = await WA.fetchQrCode();
      return { qrUrl: result.qrUrl, qrPayload: result.qrPayload };
    } catch (err) {
      app.log.error({ err }, '[WeChat QR] Failed to fetch QR code');
      reply.status(502);
      return { error: 'Failed to fetch QR code from WeChat' };
    }
  });

  app.get('/api/connector/weixin/qrcode-status', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };

    const { qrPayload } = request.query as { qrPayload?: string };
    if (!qrPayload) {
      reply.status(400);
      return { error: 'qrPayload query parameter required' };
    }

    try {
      const { WeixinAdapter: WA } = await import('../infrastructure/connectors/adapters/WeixinAdapter.js');
      const status = await WA.pollQrCodeStatus(qrPayload);

      if (status.status === 'confirmed') {
        if (!opts.activateWeixinBotToken && !opts.weixinAdapter) {
          app.log.error('[WeChat QR] QR confirmed but adapter not available — token would be lost');
          reply.status(503);
          return { error: 'WeChat adapter not ready — please retry shortly' };
        }
        if (opts.activateWeixinBotToken) {
          await opts.activateWeixinBotToken(status.botToken);
        } else {
          opts.weixinAdapter?.setBotToken(status.botToken);
          opts.startWeixinPolling?.();
        }
        app.log.info('[WeChat QR] Auto-activated — bot_token set server-side, polling started');
        return { status: 'confirmed' };
      }

      return status;
    } catch (err) {
      app.log.error({ err }, '[WeChat QR] Failed to poll QR status');
      reply.status(502);
      return { error: 'Failed to poll QR code status' };
    }
  });

  app.post('/api/connector/weixin/activate', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };

    const adapter = opts.weixinAdapter;
    if (!adapter) {
      reply.status(503);
      return { error: 'WeChat adapter not available (connector gateway not started)' };
    }

    if (!adapter.hasBotToken()) {
      reply.status(409);
      return { error: 'No bot_token available — complete QR code login first' };
    }

    opts.startWeixinPolling?.();
    app.log.info('[WeChat QR] Manual activate — polling started');

    return { ok: true, polling: adapter.isPolling() };
  });

  app.post('/api/connector/weixin/disconnect', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };

    const adapter = opts.weixinAdapter;
    if (!adapter || !opts.disconnectWeixinBotToken) {
      reply.status(503);
      return { error: 'WeChat adapter not available (connector gateway not started)' };
    }

    await opts.disconnectWeixinBotToken();
    app.log.info('[WeChat QR] Manual disconnect — bot_token cleared, polling stopped');

    return { ok: true, configured: adapter.hasBotToken() && adapter.isPolling() };
  });

  // ── F134 Phase D: Connector Permission API ──

  app.get('/api/connector/permissions/:connectorId', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };
    const { connectorId } = request.params as { connectorId: string };
    const store = opts.permissionStore;
    if (!store) {
      return { whitelistEnabled: false, commandAdminOnly: false, adminOpenIds: [], allowedGroups: [] };
    }
    return store.getConfig(connectorId);
  });

  app.put('/api/connector/permissions/:connectorId', async (request, reply) => {
    const userId = requireTrustedHubIdentity(request, reply);
    if (!userId) return { error: 'Identity required' };
    const { connectorId } = request.params as { connectorId: string };
    const store = opts.permissionStore;
    if (!store) {
      reply.status(503);
      return { error: 'Permission store not available' };
    }
    const body = request.body as {
      whitelistEnabled?: boolean;
      commandAdminOnly?: boolean;
      adminOpenIds?: string[];
      allowedGroups?: Array<{ externalChatId: string; label?: string }>;
    };
    if (body.whitelistEnabled !== undefined) {
      await store.setWhitelistEnabled(connectorId, body.whitelistEnabled);
    }
    if (body.commandAdminOnly !== undefined) {
      await store.setCommandAdminOnly(connectorId, body.commandAdminOnly);
    }
    if (body.adminOpenIds !== undefined) {
      await store.setAdminOpenIds(connectorId, body.adminOpenIds);
    }
    if (body.allowedGroups !== undefined) {
      const current = await store.listAllowedGroups(connectorId);
      for (const g of current) await store.denyGroup(connectorId, g.externalChatId);
      for (const g of body.allowedGroups) await store.allowGroup(connectorId, g.externalChatId, g.label);
    }
    return store.getConfig(connectorId);
  });
};
