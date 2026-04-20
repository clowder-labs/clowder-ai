/**
 * 字体嵌入模块配置
 * 
 * 支持三种 WASM 加载方式：
 * 1. 本地文件（离线可用）
 * 2. 官方 CDN（unpkg.com）
 * 3. 国内镜像（npmmirror.com）
 * 
 * WASM 为可选依赖，加载失败时跳过字体嵌入，不影响 PPTX 生成
 */

const DEFAULT_CONFIG = {
  woff2: {
    wasmUrl: "https://cdn.digitalhumanai.top/slidagent/pptx-craft/assets/fonteditor-core@2.6.3/woff2/woff2.wasm",
    mirrorUrl: "https://npmmirror.com/mirrors/fonteditor-core@2.6.3/woff2/woff2.wasm",
    optional: true,
  },
};

/**
 * 获取配置项
 * @param {string} key - 配置键，支持点号分隔的路径（如 'woff2.wasmUrl'）
 * @param {any} [defaultValue] - 默认值
 * @returns {any}
 */
export function getConfig(key, defaultValue) {
  const config = typeof window !== 'undefined' && window.EMBED_FONTS_CONFIG 
    ? window.EMBED_FONTS_CONFIG 
    : DEFAULT_CONFIG;
  const keys = key.split(".");
  let value = config;
  for (const k of keys) {
    if (value && typeof value === "object" && k in value) {
      value = value[k];
    } else {
      return defaultValue === undefined ? undefined : defaultValue;
    }
  }
  return value;
}

/**
 * 获取 WASM URL（优先本地，其次 CDN）
 * 在浏览器环境中，本地路径无法直接使用，需通过 convert.js 注入
 * @returns {string}
 */
export function getWasmUrl() {
  return getConfig("woff2.wasmUrl", DEFAULT_CONFIG.woff2.wasmUrl);
}

/**
 * 获取 WASM 备用镜像 URL
 * @returns {string}
 */
export function getMirrorUrl() {
  return getConfig("woff2.mirrorUrl", DEFAULT_CONFIG.woff2.mirrorUrl);
}

/**
 * WASM 是否为可选依赖
 * @returns {boolean}
 */
export function isWasmOptional() {
  return getConfig("woff2.optional", true);
}

export { DEFAULT_CONFIG };
