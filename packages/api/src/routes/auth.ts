/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * Authentication Routes — 用户登录认证
 */

import Conf from 'conf';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { getErrorMessage } from '../utils/index.js';
import { reportMetric } from '../services/metrics/index.js';

export interface AuthRoutesOptions {
  // 可以在这里添加认证相关的配置
}

export interface CasUserProfile {
  access: string;
  domain_id: string;
  domain_name: string;
  project_id: string;
  project_name: string;
  secret: string;
  sts_token: string;
  user_id: string;
  user_name: string;
}

export interface UserInfo {
  userId: string;
  userName?: string;
  expiresAt: string;
  credential: Record<string, string>;
  modelInfo: Record<string, any>;
  principal?: CasUserProfile;
  pendingInvitation?: boolean;
}

interface ModelInfoResult {
  success: boolean;
  modelInfo?: Record<string, unknown>;
  message?: string;
  needCode?: boolean;
}

interface TicketValidateResult {
  success: boolean;
  profile?: CasUserProfile;
  modelInfo?: Record<string, unknown>;
  message?: string;
}

interface LoginCallbackBody {
  ticket?: string;
  profile?: CasUserProfile;
  modelInfo?: Record<string, unknown>;
}

interface PromotionCodeBody {
  code?: string;
  promotionCode?: string;
  inviteCode?: string;
}

const DEFAULT_HUAWEI_CLAW_BASE_URL = 'https://versatile.cn-north-4.myhuaweicloud.com';
const DEFAULT_CAS_CALLBACK_SERVICE_URL = `${DEFAULT_HUAWEI_CLAW_BASE_URL}/v1/claw/cas/login/callback`;
const DEFAULT_CAS_LOGOUT_URL =
  'https://auth.huaweicloud.com/authui/login.html?service=https://auth.huaweicloud.com/authui/v1/oauth2/authorize?';
const DEFAULT_PROMOTION_CODE = 'huawei_dev_blue';
const DEFAULT_CAS_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const HUAWEI_CLAW_BASE_URL = stripTrailingSlash(
  process.env.HUAWEI_CLAW_URL || process.env.CAS_SERVICE_BASE_URL || DEFAULT_HUAWEI_CLAW_BASE_URL,
);
const CAS_CALLBACK_SERVICE_URL = process.env.CAS_CALLBACK_SERVICE_URL || DEFAULT_CAS_CALLBACK_SERVICE_URL;
const CAS_LOGIN_URL =
  process.env.CAS_LOGIN_URL ||
  `https://auth.huaweicloud.com/authui/login.html?service=${encodeURIComponent(CAS_CALLBACK_SERVICE_URL)}`;
const CAS_TICKET_VALIDATE_URL =
  process.env.CAS_TICKET_VALIDATE_URL || `${HUAWEI_CLAW_BASE_URL}/v1/claw/cas/login/ticket-validate`;
const HUAWEI_CLAW_SUBSCRIPTION_URL = `${HUAWEI_CLAW_BASE_URL}/v1/claw/client-subscription`;
const CAS_LOGOUT_URL = process.env.CAS_LOGOUT_URL || DEFAULT_CAS_LOGOUT_URL;
const CAS_SESSION_TTL_MS = parsePositiveInt(process.env.CAS_SESSION_TTL_MS, DEFAULT_CAS_SESSION_TTL_MS);
const PROMOTION_CODE_ERROR_CODES = new Set(['AgentArts.11000008', 'AgentArts.11000009']);

const secureConfig = new Conf({
  projectName: 'secure-config',
  encryptionKey: 'clowder-ai-secure-key',
  encryptionAlgorithm: 'aes-256-gcm',
});

// 简单的 session 存储（生产环境应该使用 Redis 或数据库）
export const sessions = new Map<string, UserInfo>();

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app) => {
  const skipAuth =
    process.env.OFFICE_CLAW_SKIP_AUTH === '1' ||
    process.env.OFFICE_CLAW_SKIP_AUTH === 'true' ||
    process.env.CAT_CAFE_SKIP_AUTH === '1' ||
    process.env.CAT_CAFE_SKIP_AUTH === 'true';

  // 检查登录状态接口
  app.get('/api/islogin', async (request) => {
    if (skipAuth) {
      return {
        islogin: true,
        hascode: true,
        userId: 'debug-user',
        userName: 'debug-user',
        isskip: true,
        loginUrl: CAS_LOGIN_URL,
        logoutUrl: CAS_LOGOUT_URL,
      };
    }

    const userId = readUserIdFromRequest(request);
    if (!userId) {
      return buildLoggedOutPayload();
    }

    const storedUserInfo = getStoredUserInfo(userId);
    if (!storedUserInfo) {
      clearStoredUserInfo(userId);
      return buildLoggedOutPayload();
    }

    if (!isSessionActive(storedUserInfo)) {
      clearStoredUserInfo(userId);
      return buildLoggedOutPayload();
    }

    if (storedUserInfo.pendingInvitation) {
      return {
        ...buildLoggedOutPayload(),
        userId: storedUserInfo.userId,
        userName: storedUserInfo.userName,
        pendingInvitation: true,
      };
    }

    const isFirstIsLoginCall = !sessions.has(storedUserInfo.userId);
    sessions.set(storedUserInfo.userId, { ...storedUserInfo });
    if (isFirstIsLoginCall) {
      await refreshMaaSModelsAfterLogin(request, storedUserInfo.userId);
    }

    return {
      islogin: true,
      hascode: true,
      userId: storedUserInfo.userId,
      userName: storedUserInfo.userName,
      isskip: false,
      loginUrl: CAS_LOGIN_URL,
      logoutUrl: CAS_LOGOUT_URL,
    };
  });

  // CAS 回调：校验 ticket、保存用户信息，并根据 ticket-validate 是否返回 modelInfo 决定是否要求邀请码
  app.post('/api/login/callback', async (request, reply) => {
    if (skipAuth) {
      attachUserHeaders(reply, 'debug-user');
      return { success: true, userId: 'debug-user', userName: 'debug-user', redirectTo: '/' };
    }

    const { ticket, profile, modelInfo } = request.body as LoginCallbackBody;
    const resolvedProfile = normalizeCasUserProfile(profile);
    const trimmedTicket = ticket?.trim();
    if (!resolvedProfile && !trimmedTicket) {
      return reply.code(400).send({ success: false, message: '缺少 ticket 参数' });
    }

    if (resolvedProfile) {
      const session = createCasUserSession(resolvedProfile);
      return completeCasLogin(request, reply, session, {
        modelInfo: isRecord(modelInfo) ? modelInfo : undefined,
      });
    }

    const validateResult = await validateCasTicket(trimmedTicket!);
    if (!validateResult.success || !validateResult.profile) {
      return reply.code(401).send({ success: false, message: validateResult.message || '票据校验失败' });
    }

    const session = createCasUserSession(validateResult.profile);
    return completeCasLogin(request, reply, session, {
      modelInfo: validateResult.modelInfo,
    });
  });

  // 补充邀请码后完成订阅
  app.post('/api/login/invitation', async (request, reply) => {
    if (skipAuth) {
      attachUserHeaders(reply, 'debug-user');
      return { success: true, userId: 'debug-user', userName: 'debug-user', redirectTo: '/' };
    }

    const userId = readUserIdFromRequest(request);
    if (!userId) {
      return reply.code(401).send({ success: false, message: '缺少用户身份，请重新登录' });
    }

    const session = getStoredUserInfo(userId);
    if (!session) {
      clearStoredUserInfo(userId);
      return reply.code(401).send({ success: false, message: '登录信息已失效，请重新登录' });
    }

    if (!session.pendingInvitation) {
      attachUserHeaders(reply, session.userId);
      return {
        success: true,
        userId: session.userId,
        userName: session.userName,
        redirectTo: '/',
      };
    }

    const body = request.body as PromotionCodeBody;
    const promotionCode = extractPromotionCode(body);
    if (!promotionCode) {
      return reply.code(400).send({ success: false, message: '请输入邀请码' });
    }

    const modelInfoResult = await subscriptionClaw(session, promotionCode);
    if (!modelInfoResult.success || !modelInfoResult.modelInfo) {
      return reply.code(modelInfoResult.needCode ? 400 : 502).send({
        success: false,
        needCode: Boolean(modelInfoResult.needCode),
        message: modelInfoResult.message || '邀请码校验失败',
      });
    }

    session.modelInfo = modelInfoResult.modelInfo;
    session.pendingInvitation = false;
    storeUserInfo(session);
    sessions.set(session.userId, { ...session });
    await refreshMaaSModelsAfterLogin(request, session.userId);
    attachUserHeaders(reply, session.userId);

    return {
      success: true,
      userId: session.userId,
      userName: session.userName,
      message: '登录成功',
      redirectTo: '/',
    };
  });

  // 退出登录接口
  app.post('/api/logout', async (request) => {
    if (skipAuth) {
      return { success: true, message: '退出登录成功', logoutUrl: CAS_LOGOUT_URL };
    }

    const userId = readUserIdFromRequest(request);
    if (userId) {
      clearStoredUserInfo(userId);
    }

    return { success: true, message: '退出登录成功', logoutUrl: CAS_LOGOUT_URL };
  });
};

async function completeCasLogin(
  request: FastifyRequest,
  reply: FastifyReply,
  session: UserInfo,
  options?: {
    modelInfo?: Record<string, unknown>;
  },
) {
  if (isRecord(options?.modelInfo)) {
    session.modelInfo = options.modelInfo;
    session.pendingInvitation = false;
    storeUserInfo(session);
    sessions.set(session.userId, { ...session });
    attachUserHeaders(reply, session.userId);
    await refreshMaaSModelsAfterLogin(request, session.userId);
    reportMetric('agentarts_claw_user_login', 1).catch(() => {});
    return {
      success: true,
      userId: session.userId,
      userName: session.userName,
      redirectTo: '/',
    };
  }

  session.pendingInvitation = true;
  storeUserInfo(session);
  sessions.delete(session.userId);
  attachUserHeaders(reply, session.userId);
  return {
    success: true,
    needCode: true,
    userId: session.userId,
    userName: session.userName,
    message: '当前账号尚未开通 OPT，请填写邀请码后继续',
    redirectTo: '/login/invitation',
  };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function unwrapPayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  if (isRecord(value.data)) return value.data;
  if (isRecord(value.result)) return value.result;
  return value;
}

function normalizeCasUserProfile(value: unknown): CasUserProfile | null {
  const payload = unwrapPayload(value);
  if (!payload) return null;

  const profile: CasUserProfile = {
    access: readString(payload, 'access', 'accessKey'),
    domain_id: readString(payload, 'domain_id', 'domainId'),
    domain_name: readString(payload, 'domain_name', 'domainName'),
    project_id: readString(payload, 'project_id', 'projectId'),
    project_name: readString(payload, 'project_name', 'projectName'),
    secret: readString(payload, 'secret', 'secretKey'),
    sts_token: readString(payload, 'sts_token', 'stsToken'),
    user_id: readString(payload, 'user_id', 'userId'),
    user_name: readString(payload, 'user_name', 'userName'),
  };

  const hasUserIdentity = Boolean(profile.user_id || profile.user_name);
  const hasDomainIdentity = Boolean(profile.domain_id || profile.domain_name);
  return hasUserIdentity && hasDomainIdentity ? profile : null;
}

function buildSessionUserId(profile: CasUserProfile): string {
  const domainPart = profile.domain_id || profile.domain_name || 'cas';
  const userPart = profile.user_name || profile.user_id || 'user';
  return `${domainPart}:${userPart}`;
}

function buildSessionExpiresAt(): string {
  return new Date(Date.now() + CAS_SESSION_TTL_MS).toISOString();
}

function createCasUserSession(profile: CasUserProfile): UserInfo {
  return {
    userId: buildSessionUserId(profile),
    userName: profile.user_name || profile.user_id,
    expiresAt: buildSessionExpiresAt(),
    credential: {
      access: profile.access,
      secret: profile.secret,
      sts_token: profile.sts_token,
      domain_id: profile.domain_id,
      domain_name: profile.domain_name,
      project_id: profile.project_id,
      project_name: profile.project_name,
      user_id: profile.user_id,
      user_name: profile.user_name,
    },
    modelInfo: {},
    principal: profile,
  };
}

function isUserInfo(value: unknown): value is UserInfo {
  if (!isRecord(value)) return false;
  return (
    typeof value.userId === 'string' &&
    typeof value.expiresAt === 'string' &&
    isRecord(value.credential) &&
    isRecord(value.modelInfo)
  );
}

function getStoredUserInfo(userId: string): UserInfo | null {
  const raw = secureConfig.get(`${userId}-new`);
  if (isUserInfo(raw)) {
    return raw;
  }

  const legacyRaw = secureConfig.get(userId);
  return isUserInfo(legacyRaw) ? legacyRaw : null;
}

function storeUserInfo(userInfo: UserInfo): void {
  secureConfig.set(userInfo.userId, userInfo.expiresAt);
  secureConfig.set(`${userInfo.userId}-new`, userInfo);
}

function clearStoredUserInfo(userId: string): void {
  sessions.delete(userId);
  secureConfig.delete(userId);
  secureConfig.delete(`${userId}-new`);
}

function isSessionActive(userInfo: UserInfo | null | undefined): boolean {
  if (!userInfo?.expiresAt) return false;
  const expiresAt = new Date(userInfo.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function attachUserHeaders(reply: FastifyReply, userId: string): void {
  reply.header('X-Cat-Cafe-User', userId);
  reply.header('X-Office-Claw-User', userId);
  reply.header('X-Session-Id', `session-${Date.now()}-${Math.random()}`);
}

function buildLoggedOutPayload() {
  return {
    islogin: false,
    hascode: false,
    isskip: false,
    loginUrl: CAS_LOGIN_URL,
    logoutUrl: CAS_LOGOUT_URL,
  };
}

function readUserIdFromRequest(request: FastifyRequest): string {
  const headerUserId = request.headers['x-office-claw-user'] ?? request.headers['x-cat-cafe-user'];
  if (typeof headerUserId === 'string' && headerUserId.trim()) {
    return headerUserId.trim();
  }

  if (isRecord(request.body)) {
    const bodyUserId = readString(request.body, 'userId');
    if (bodyUserId) return bodyUserId;
  }

  return '';
}

function extractPromotionCode(body: PromotionCodeBody | undefined): string {
  return body?.promotionCode?.trim() || body?.inviteCode?.trim() || body?.code?.trim() || '';
}

async function validateCasTicket(ticket: string): Promise<TicketValidateResult> {
  const payload = {
    ticket,
    service: CAS_CALLBACK_SERVICE_URL,
  };

  const requestVariants: Array<() => Promise<Response>> = [
    () =>
      fetch(CAS_TICKET_VALIDATE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json;charset=utf8',
        },
        body: JSON.stringify(payload),
      }),
    () =>
      fetch(
        `${CAS_TICKET_VALIDATE_URL}?ticket=${encodeURIComponent(ticket)}&service=${encodeURIComponent(CAS_CALLBACK_SERVICE_URL)}`,
        {
          method: 'GET',
        },
      ),
  ];

  let lastMessage = '票据校验失败';

  for (const requestFactory of requestVariants) {
    try {
      const response = await requestFactory();
      if (!response.ok) {
        const { error_code, error_message } = await getErrorMessage(response);
        lastMessage = `票据校验失败，错误码: ${error_code}, 错误信息: ${error_message}`;
        continue;
      }

      const data = await response.json();
      const profile = normalizeCasUserProfile(data);
      if (!profile) {
        return { success: false, message: '票据校验成功，但未返回有效用户信息' };
      }

      const payload = unwrapPayload(data);
      const modelInfo = isRecord(payload?.model_info) ? payload.model_info : payload?.model_info ?? payload?.modelInfo;
      return {
        success: true,
        profile,
        modelInfo: isRecord(modelInfo) ? modelInfo : undefined,
      };
    } catch (error) {
      console.error('校验 CAS ticket 失败:', error);
      lastMessage = '票据校验失败';
    }
  }

  return { success: false, message: lastMessage };
}

function buildSubscriptionRequest(userInfo: UserInfo, promotionCode?: string, options?: { useDefaultPromotionCode?: boolean }) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json;charset=utf8',
  };
  const body: Record<string, string> = {};
  const effectivePromotionCode =
    promotionCode?.trim() || (options?.useDefaultPromotionCode ? DEFAULT_PROMOTION_CODE : '');
  if (effectivePromotionCode) {
    body.promotion_code = effectivePromotionCode;
  }

  const credential = userInfo.credential;
  const principal = userInfo.principal;
  const accessKey = principal?.access || credential.access || '';
  const secretKey = principal?.secret || credential.secret || '';
  const securityToken = principal?.sts_token || credential.sts_token || '';

  if (accessKey) headers['X-Access-Key'] = accessKey;
  if (secretKey) headers['X-Secret-Key'] = secretKey;
  if (securityToken) headers['X-Security-Token'] = securityToken;

  for (const [key, value] of Object.entries(credential)) {
    if (value) {
      body[key] = value;
    }
  }
  return { headers, body };
}

// 开通客户端 claw / 检查是否已注册 OPT
async function subscriptionClaw(
  userInfo: UserInfo,
  promotionCode?: string,
  options?: { useDefaultPromotionCode?: boolean },
): Promise<ModelInfoResult> {
  try {
    const { headers, body } = buildSubscriptionRequest(userInfo, promotionCode, options);
    const subResponse = await fetch(HUAWEI_CLAW_SUBSCRIPTION_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!subResponse.ok) {
      const { error_code, error_message } = await getErrorMessage(subResponse);
      const needCode = PROMOTION_CODE_ERROR_CODES.has(error_code);
      console.error(`开通客户端失败，错误码: ${error_code}, 错误信息: ${error_message}`);
      return { success: false, message: needCode ? '邀请码无效，请重新输入' : '开通失败', needCode };
    }

    const data = await subResponse.json();
    const payload = unwrapPayload(data);
    const modelInfo = isRecord(payload?.model_info) ? payload.model_info : payload?.model_info ?? payload?.modelInfo;
    if (!isRecord(modelInfo)) {
      return { success: false, message: '开通成功，但未返回模型信息' };
    }

    if (promotionCode?.trim()) {
      secureConfig.set('lastPromotionCode', promotionCode.trim());
    }

    return { success: true, modelInfo };
  } catch (error) {
    console.error('开通客户端 claw 失败:', error);
    return { success: false, message: '开通失败' };
  }
}

async function refreshMaaSModelsAfterLogin(request: FastifyRequest, userId: string) {
  try {
    const refreshResponse = await request.server.inject({
      method: 'GET',
      url: '/api/maas-models',
      headers: {
        'x-cat-cafe-user': userId,
        'x-office-claw-user': userId,
        'x-refresh': 'true',
      },
    });

    if (refreshResponse.statusCode >= 400) {
      request.log.warn({ statusCode: refreshResponse.statusCode, userId }, 'refresh maas models failed after login');
    }
  } catch (error) {
    request.log.warn({ error, userId }, 'refresh maas models errored after login');
  }
}
