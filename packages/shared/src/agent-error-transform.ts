/*
 * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 */

export const MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE = 'ModelArts.81011';
export const MODEL_ARTS_RATE_LIMIT_ERROR_CODE = 'ModelArts.81101';
export const APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE = 'APIG.0308';
const MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT = 'Input text May contain sensitive information';
const MODEL_ARTS_RATE_LIMIT_MESSAGE = '褰撳墠璇锋眰杈冨锛屾ā鍨嬫殏鏃堕檺娴侊紝璇风◢鍚庨噸璇曘€?;
const DAILY_QUOTA_EXHAUSTED_MESSAGE = `鎮ㄥソ锛屾埅鑷崇洰鍓嶆偍浠婃棩鐨勫厤璐规ā鍨嬩娇鐢ㄩ搴﹀凡鐢ㄥ敖銆?
濡傞渶缁х画浣跨敤鏈嶅姟锛屽彲閫夋嫨[璐拱](https://console.huaweicloud.com/modelarts/?region=cn-southwest-2#/model-studio/deployment)鍗庝负浜慚aaS妯″瀷鏈嶅姟杩涜鎺ュ叆锛涙垨浜庢鏃ュ啀娆¤闂紝绯荤粺灏嗕负鎮ㄩ噸缃厤璐归搴︺€俙;

export type ErrorFallbackKind =
  | 'timeout' // 鍝嶅簲瓒呮椂
  | 'connection' // 杩炴帴澶辫触
  | 'config' // 閰嶇疆閿欒
  | 'abrupt_exit' // CLI 寮傚父閫€鍑?
  | 'max_iterations' // 杈惧埌鏈€澶ц凯浠ｆ鏁?
  | 'rate_limit' // 妯″瀷鐬椂闄愭祦
  | 'daily_quota' // 褰撴棩棰濆害鑰楀敖
  | 'sensitive_input' // 鏁忔劅璇嶆牎楠?
  | 'unknown'; // 鏈垎绫婚敊璇?

export interface ErrorFallbackMetadata {
  v: 1;
  kind: ErrorFallbackKind;
  rawError: string;
  timestamp: number;
}

export interface ErrorLike {
  catId?: string;
  error?: string;
  errorCode?: string;
  metadata?: { provider?: string; model?: string };
}

function normalizeQuotedText(rawError: string): string {
  return rawError.replace(/['']/g, "'").replace(/[""]/g, '"');
}

export function isSensitiveInputError(msg: ErrorLike | string): boolean {
  if (typeof msg === 'string') {
    const normalized = normalizeQuotedText(msg);
    return (
      normalized.includes(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) &&
      normalized.toLowerCase().includes(MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT.toLowerCase())
    );
  }
  if (msg.errorCode === MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) return true;
  const rawError = msg.error?.trim();
  if (!rawError) return false;
  const normalized = normalizeQuotedText(rawError);
  return (
    normalized.includes(MODEL_ARTS_SENSITIVE_INPUT_ERROR_CODE) &&
    normalized.toLowerCase().includes(MODEL_ARTS_SENSITIVE_INPUT_MESSAGE_FRAGMENT.toLowerCase())
  );
}

export function isRateLimitError(msg: ErrorLike | string): boolean {
  if (typeof msg === 'string') {
    const normalized = normalizeQuotedText(msg);
    return normalized.includes(MODEL_ARTS_RATE_LIMIT_ERROR_CODE);
  }
  if (msg.errorCode === MODEL_ARTS_RATE_LIMIT_ERROR_CODE) return true;
  const rawError = msg.error?.trim();
  if (!rawError) return false;
  const normalized = normalizeQuotedText(rawError);
  return normalized.includes(MODEL_ARTS_RATE_LIMIT_ERROR_CODE);
}

export function isDailyQuotaExhaustedError(msg: ErrorLike | string): boolean {
  if (typeof msg === 'string') {
    const normalized = normalizeQuotedText(msg);
    return normalized.includes(APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE);
  }
  if (msg.errorCode === APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE) return true;
  const rawError = msg.error?.trim();
  if (!rawError) return false;
  const normalized = normalizeQuotedText(rawError);
  return normalized.includes(APIG_DAILY_QUOTA_EXHAUSTED_ERROR_CODE);
}

function isTimeoutError(rawError: string): boolean {
  return /鍝嶅簲瓒呮椂|timed out|timeout/i.test(rawError);
}

function isAbruptExitError(rawError: string): boolean {
  // 鎺掗櫎 "connection closed unexpectedly" 鍥犱负瀹冨簲璇ュ綊绫讳负杩炴帴閿欒
  // 鍙尮閰?CLI 寮傚父閫€鍑虹浉鍏崇殑閿欒
  return /CLI\s*寮傚父閫€鍑簗abnormal exit|exited unexpectedly|subprocess exited/i.test(rawError);
}

function isConnectionError(rawError: string): boolean {
  return /connection failed|connection closed unexpectedly|WebSocket connection closed/i.test(rawError);
}

function isMaxIterationsReachedError(rawError: string): boolean {
  return /max iterations reached|max_iterations_reached/i.test(rawError);
}

function isHuaweiMaaSSessionError(rawError: string): boolean {
  return /huawei maas session (not found|expired)/i.test(rawError);
}

type ConfigurationMatch = {
  pattern: RegExp;
  message: string;
};

const CONFIGURATION_MATCHES: ConfigurationMatch[] = [
  {
    pattern: /WebSocket URL is not configured/i,
    message: '褰撳墠鏅鸿兘浣撶己灏?WebSocket 鍦板潃閰嶇疆锛屾殏鏃舵棤娉曞惎鍔ㄣ€傝鍏堥厤缃搴旀櫤鑳戒綋鐨勮繛鎺ュ湴鍧€鍚庡啀閲嶈瘯銆?,
  },
  {
    pattern: /provider profile is not configured|bound provider profile/i,
    message: '褰撳墠鏅鸿兘浣撴湭缁戝畾鍙敤鐨?provider profile锛屾殏鏃舵棤娉曞鐞嗚姹傘€傝鍏堟鏌ュ苟缁戝畾姝ｇ‘鐨?provider profile銆?,
  },
  {
    pattern: /requires a default model profile|default model profile|model profile is missing/i,
    message: '褰撳墠鏅鸿兘浣撶己灏戦粯璁?model profile 閰嶇疆锛屾殏鏃舵棤娉曞鐞嗚姹傘€傝鍏堜负瀵瑰簲 provider profile 閰嶇疆榛樿妯″瀷銆?,
  },
  {
    pattern: /model profile ".+" not found or missing apiKey|missing apiKey|API key/i,
    message:
      '褰撳墠鏅鸿兘浣撶殑妯″瀷閰嶇疆缂哄皯 API Key 鎴栨ā鍨嬫。妗堜笉瀛樺湪锛屾殏鏃舵棤娉曞鐞嗚姹傘€傝妫€鏌ュ搴?model profile 鐨?API Key 閰嶇疆銆?,
  },
];

function isConfigurationError(rawError: string): boolean {
  return (
    CONFIGURATION_MATCHES.some(({ pattern }) => pattern.test(rawError)) ||
    /not configured|sidecar exited|CLI path/i.test(rawError)
  );
}

function getConfigurationErrorMessage(rawError: string): string {
  const matched = CONFIGURATION_MATCHES.find(({ pattern }) => pattern.test(rawError));
  if (matched) return matched.message;
  return `褰撳墠鏅鸿兘浣撻厤缃瓨鍦ㄩ棶棰橈紝鏆傛椂鏃犳硶澶勭悊杩欐璇锋眰銆傝妫€鏌ラ厤缃悗閲嶈瘯銆傚師濮嬮敊璇細${rawError}`;
}

export function classifyError(rawError: string): ErrorFallbackKind {
  if (isRateLimitError(rawError)) return 'rate_limit';
  if (isDailyQuotaExhaustedError(rawError)) return 'daily_quota';
  if (isSensitiveInputError(rawError)) return 'sensitive_input';
  if (isTimeoutError(rawError)) return 'timeout';
  if (isAbruptExitError(rawError)) return 'abrupt_exit';
  if (isConfigurationError(rawError)) return 'config';
  if (isConnectionError(rawError)) return 'connection';
  if (isMaxIterationsReachedError(rawError)) return 'max_iterations';
  return 'unknown';
}

export function getRateLimitMessage(): string {
  return MODEL_ARTS_RATE_LIMIT_MESSAGE;
}

export function getDailyQuotaExhaustedMessage(): string {
  return DAILY_QUOTA_EXHAUSTED_MESSAGE;
}

export function getFriendlyAgentErrorMessage(msg: ErrorLike): string {
  let rawError = msg.error?.trim() || 'Unknown error';

  // 鎴柇杩囬暱鐨勯敊璇秷鎭紙缁熶竴鍦ㄥ叡浜ā鍧楀鐞嗭級
  const MAX_RAW_ERROR_LENGTH = 1000;
  if (rawError.length > MAX_RAW_ERROR_LENGTH) {
    rawError = rawError.slice(0, MAX_RAW_ERROR_LENGTH) + '... (truncated)';
  }

  if (isRateLimitError(msg)) {
    return getRateLimitMessage();
  }

  if (isDailyQuotaExhaustedError(msg)) {
    return getDailyQuotaExhaustedMessage();
  }

  if (isSensitiveInputError(msg)) {
    return '妫€娴嬪埌杈撳叆鍐呭瑙﹀彂浜嗘晱鎰熻瘝鏍￠獙銆傝閲嶆柊鎵撳紑涓€涓柊浼氳瘽鍚庡啀璇曘€?;
  }

  if (isTimeoutError(rawError)) {
    return '杩欐鍝嶅簲瓒呮椂浜嗭紝鎴戝厛缁撴潫鏈灏濊瘯銆傝绋嶅悗鐩存帴閲嶈瘯銆?;
  }

  if (isAbruptExitError(rawError)) {
    return '杩欐鍝嶅簲涓柇浜嗭紝鎴戞病鑳界ǔ瀹氬畬鎴愬鐞嗐€傝閲嶈瘯涓€娆★紱濡傛灉杩炵画鍑虹幇锛岃绋嶅悗鍐嶈瘯銆?;
  }

  if (isConfigurationError(rawError)) {
    return getConfigurationErrorMessage(rawError);
  }

  if (isConnectionError(rawError)) {
    return '褰撳墠鏅鸿兘浣撹繛鎺ヤ笉绋冲畾锛屾殏鏃舵棤娉曞畬鎴愯繖娆″鐞嗐€傝绋嶅悗閲嶈瘯锛涘鏋滄寔缁嚭鐜帮紝璇存槑鍚庣鏈嶅姟鍙兘闇€瑕佹鏌ャ€?;
  }

  if (isMaxIterationsReachedError(rawError)) {
    return '宸茶揪鍒版湰娆″璇濆厑璁哥殑鏈€澶ф€濊€冭疆鏁帮紝浠诲姟鏈湪闄愬畾鐨勮疆鏁板唴瀹屾垚銆?;
  }

  return '杩欐澶勭悊娌℃湁椤哄埄瀹屾垚銆傛垜鍏堢粨鏉熸湰娆″皾璇曪紝璇风◢鍚庨噸璇曘€?;
}

