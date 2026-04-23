import type { AuthenticateOutcome, AuthProvider, AuthSessionInfo } from '@office-claw/plugin-api/auth';

interface LoginInput {
  domainName?: string;
  userName?: string;
  password?: string;
  userType?: 'huawei' | 'iam';
  promotionCode?: string;
}

interface TokenResult {
  success: boolean;
  token?: string;
  expiresAt?: string;
  message?: string;
  domainId?: string;
}

interface ModelInfoResult {
  success: boolean;
  modelInfo?: Record<string, unknown>;
  message?: string;
  needCode?: boolean;
}

const IAM_URL = 'https://iam.myhuaweicloud.com';
const DEFAULT_PROMOTION_CODE = 'huawei_dev_blue';

interface HuaweiIamAuthProviderOptions {
  fetchImpl?: typeof fetch;
}

async function getErrorMessage(response: Response): Promise<{ error_code: string; error_message: string }> {
  const data = (await response.json()) as Record<string, unknown>;
  return {
    error_code: typeof data.error_code === 'string' ? data.error_code : String(response.status),
    error_message:
      typeof data.error_message === 'string'
        ? data.error_message
        : typeof data.error_msg === 'string'
          ? data.error_msg
          : response.statusText,
  };
}

async function getTokens(
  fetchImpl: typeof fetch,
  domainName: string,
  userName: string,
  password: string,
): Promise<TokenResult> {
  try {
    const authResponse = await fetchImpl(`${IAM_URL}/v3/auth/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=utf8' },
      body: JSON.stringify({
        auth: {
          identity: {
            methods: ['password'],
            password: {
              user: {
                domain: { name: domainName },
                name: userName,
                password,
              },
            },
          },
          scope: { project: { name: 'cn-north-4' } },
        },
      }),
    });

    if (!authResponse.ok) {
      const { error_code, error_message } = await getErrorMessage(authResponse);
      throw new Error(`认证失败，错误码: ${error_code}, 错误信息: ${error_message}`);
    }

    const data = (await authResponse.json()) as Record<string, unknown>;
    const tokenObj = data.token as Record<string, unknown> | undefined;
    const userObj = tokenObj?.user as Record<string, unknown> | undefined;
    const domainObj = userObj?.domain as Record<string, unknown> | undefined;
    const domainId = (domainObj?.id as string) || domainName;
    const expiresAt = (tokenObj?.expires_at as string) || new Date().toISOString();
    return {
      success: true,
      token: authResponse.headers.get('x-subject-token') ?? '',
      expiresAt,
      domainId,
    };
  } catch (error) {
    console.error('获取IAM Token失败:', error);
    return { success: false, message: '登录失败' };
  }
}

async function subscriptionClaw(
  fetchImpl: typeof fetch,
  token: string,
  rememberedPromotionCode: string | null,
  promotionCode?: string,
): Promise<ModelInfoResult> {
  try {
    const subResponse = await fetchImpl(`https://versatile.cn-north-4.myhuaweicloud.com/v1/claw/client-subscription`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json;charset=utf8',
        'X-Auth-Token': token,
      },
      body: JSON.stringify({
        promotion_code: promotionCode || rememberedPromotionCode || DEFAULT_PROMOTION_CODE,
      }),
    });

    if (!subResponse.ok) {
      const { error_code, error_message } = await getErrorMessage(subResponse);
      const needCode = ['AgentArts.11000008', 'AgentArts.11000009'].includes(error_code);
      console.error(`开通客户端失败，错误码: ${error_code}, 错误信息: ${error_message}`);
      return { success: false, message: needCode ? '邀请码无效，请重新输入' : '开通失败', needCode };
    }

    const data = (await subResponse.json()) as Record<string, unknown>;
    return { success: true, modelInfo: (data.model_info as Record<string, unknown>) ?? {} };
  } catch (error) {
    console.error('开通客户端claw失败:', error);
    return { success: false, message: '开通失败' };
  }
}

/** Provider-specific state stored in session.providerState. */
interface HuaweiProviderState {
  token: string;
  modelInfo: Record<string, unknown>;
  domainId: string;
  promotionCode?: string;
}

export function createHuaweiIamAuthProvider(options: HuaweiIamAuthProviderOptions = {}): AuthProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastPromotionCode: string | null = null;

  return {
    id: 'huawei-iam',
    displayName: 'Huawei IAM',
    presentation: {
      mode: 'form',
      submitLabel: '登录',
      fields: [
        {
          name: 'userType',
          label: '账号类型',
          type: 'select',
          required: true,
          options: [
            { value: 'huawei', label: '华为云账号' },
            { value: 'iam', label: 'IAM 用户' },
          ],
        },
        { name: 'domainName', label: '租户 / 域名', type: 'text', required: true },
        { name: 'userName', label: 'IAM 用户名', type: 'text', required: false },
        { name: 'password', label: '密码', type: 'password', required: true },
        { name: 'promotionCode', label: '邀请码', type: 'text', required: false },
      ],
      description: 'Authenticate with Huawei IAM.',
    },

    async getPublicConfig() {
      return { hascode: Boolean(lastPromotionCode || DEFAULT_PROMOTION_CODE) };
    },

    /**
     * Core authentication: credentials → identity.
     * Also performs MaaS subscription check — if an invite code is required,
     * authentication fails with `needCode: true` BEFORE session creation.
     */
    async authenticate(input): Promise<AuthenticateOutcome> {
      const raw = input.credentials as LoginInput;
      const domainName = typeof raw.domainName === 'string' ? raw.domainName.trim() : '';
      const password = typeof raw.password === 'string' ? raw.password : '';
      const userType = raw.userType === 'iam' ? 'iam' : 'huawei';
      const userName = typeof raw.userName === 'string' ? raw.userName.trim() : '';
      const name = userType === 'huawei' ? domainName : userName;

      if (!domainName || !password || !name) {
        return { success: false, message: '用户名或密码错误' };
      }

      const tokenResult = await getTokens(fetchImpl, domainName, name, password);
      if (!tokenResult.success || !tokenResult.token) {
        return { success: false, message: tokenResult.message || '登录失败' };
      }

      const promotionCode =
        typeof raw.promotionCode === 'string' && raw.promotionCode.trim() ? raw.promotionCode.trim() : undefined;

      // Subscription check — must happen before session creation so needCode
      // can surface to the frontend as an auth failure.
      const subResult = await subscriptionClaw(fetchImpl, tokenResult.token, lastPromotionCode, promotionCode);
      if (!subResult.success) {
        if (subResult.needCode) {
          lastPromotionCode = null;
          return { success: false, message: subResult.message || '邀请码无效，请重新输入', needCode: true };
        }
        return { success: false, message: subResult.message || '开通失败' };
      }

      if (promotionCode) {
        lastPromotionCode = promotionCode;
      }

      const providerState: HuaweiProviderState = {
        token: tokenResult.token,
        modelInfo: subResult.modelInfo ?? {},
        domainId: tokenResult.domainId || domainName,
        promotionCode,
      };

      return {
        success: true,
        principal: {
          userId: `${domainName}:${name}`,
          displayName: name,
          expiresAt: tokenResult.expiresAt ? new Date(tokenResult.expiresAt) : null,
          providerState,
        },
      };
    },
  };
}
