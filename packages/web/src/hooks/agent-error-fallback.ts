export const MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE = 'ModelArts.81011';
const MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT = 'Input text May contain sensitive information';

export type ErrorLike = {
  catId?: string;
  error?: string;
  errorCode?: string;
  metadata?: { provider?: string; model?: string };
};

function normalizeQuotedText(rawError: string): string {
  return rawError.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

export function isSensitiveInputAgentError(msg: ErrorLike): boolean {
  if (msg.errorCode === MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) return true;
  const rawError = msg.error?.trim();
  if (!rawError) return false;
  const normalized = normalizeQuotedText(rawError);
  return (
    normalized.includes(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) &&
    normalized.toLowerCase().includes(MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT.toLowerCase())
  );
}

export function getSensitiveInputErrorToastContent(): { title: string; message: string } {
  return {
    title: '检测到敏感词',
    message: '当前对话触发了敏感词校验，请重新打开一个新会话后再试。',
  };
}

type ConfigurationMatch = {
  pattern: RegExp;
  message: string;
};

const CONFIGURATION_MATCHES: ConfigurationMatch[] = [
  {
    pattern: /WebSocket URL is not configured/i,
    message: '当前智能体缺少 WebSocket 地址配置，暂时无法启动。请先配置对应智能体的连接地址后再重试。',
  },
  {
    pattern: /provider profile is not configured|bound provider profile/i,
    message: '当前智能体未绑定可用的 provider profile，暂时无法处理请求。请先检查并绑定正确的 provider profile。',
  },
  {
    pattern: /requires a default model profile|default model profile|model profile is missing/i,
    message: '当前智能体缺少默认 model profile 配置，暂时无法处理请求。请先为对应 provider profile 配置默认模型。',
  },
  {
    pattern: /model profile ".+" not found or missing apiKey|missing apiKey|API key/i,
    message:
      '当前智能体的模型配置缺少 API Key 或模型档案不存在，暂时无法处理请求。请检查对应 model profile 的 API Key 配置。',
  },
];

function isTimeoutError(rawError: string): boolean {
  return /响应超时|timed out|timeout/i.test(rawError);
}

function isAbruptExitError(rawError: string): boolean {
  // 排除 "connection closed unexpectedly" 因为它应该归类为连接错误
  // 只匹配 CLI 异常退出相关的错误
  return /CLI\s*异常退出|abnormal exit|exited unexpectedly|subprocess exited/i.test(rawError);
}

function isConnectionError(rawError: string): boolean {
  return /connection failed|connection closed unexpectedly|WebSocket connection closed/i.test(rawError);
}

function isConfigurationError(rawError: string): boolean {
  return (
    CONFIGURATION_MATCHES.some(({ pattern }) => pattern.test(rawError)) ||
    /not configured|invalid|missing|incomplete|sidecar exited|CLI path/i.test(rawError)
  );
}

function getConfigurationErrorMessage(rawError: string): string {
  const matched = CONFIGURATION_MATCHES.find(({ pattern }) => pattern.test(rawError));
  if (matched) return matched.message;
  return `当前智能体配置存在问题，暂时无法处理这次请求。请检查配置后重试。原始错误：${rawError}`;
}

export function getFriendlyAgentErrorMessage(msg: ErrorLike): string {
  const rawError = msg.error?.trim() || 'Unknown error';

  if (isSensitiveInputAgentError(msg)) {
    return '检测到输入内容触发了敏感词校验。请重新打开一个新会话后再试。';
  }

  if (isTimeoutError(rawError)) {
    return '这次响应超时了，我先结束本次尝试。请稍后直接重试。';
  }

  if (isAbruptExitError(rawError)) {
    return '这次响应中断了，我没能稳定完成处理。请重试一次；如果连续出现，请稍后再试。';
  }

  if (isConfigurationError(rawError)) {
    return getConfigurationErrorMessage(rawError);
  }

  if (isConnectionError(rawError)) {
    return '当前智能体连接不稳定，暂时无法完成这次处理。请稍后重试；如果持续出现，说明后端服务可能需要检查。';
  }

  return '这次处理没有顺利完成。我先结束本次尝试，请稍后重试。';
}
