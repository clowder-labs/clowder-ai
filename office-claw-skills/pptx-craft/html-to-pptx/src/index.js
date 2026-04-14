// 入口，barrel export

// FontAwesome SVG Core
import { library } from "@fortawesome/fontawesome-svg-core";
import { fab } from "@fortawesome/free-brands-svg-icons";
import { far } from "@fortawesome/free-regular-svg-icons";
import { fas } from "@fortawesome/free-solid-svg-icons";
import * as PptxGenJSImport from "pptxgenjs";

// Add all icons to library
library.add(fas, far, fab);

// Normalize import
const PptxGenJS = PptxGenJSImport?.default ?? PptxGenJSImport;

// 字体嵌入工具
import { resolvePptxFontFace, withPPTXEmbedFonts } from "./utils.js";

// Re-export from converter
export { getProcessedImage } from "./converter/image.js";
export { processSlide } from "./converter/slide.js";
// Re-export from parser
export { isNoWrap } from "./parser/dom.js";
// Re-export from utils
export {
  detectLineBreakBetweenNodes,
  detectLineBreaks,
  detectLineBreaksForInlineElement,
  detectLineBreaksForTextNode,
  extractTableData,
  generateBlurredSVG,
  generateCompositeBorderSVG,
  generateCustomShapeSVG,
  generateGradientSVG,
  getBorderInfo,
  getPadding,
  getRotation,
  getSoftEdges,
  getTextStyle,
  getVisibleShadow,
  isClippedByParent,
  isTextContainer,
  parseColor,
  svgStringToPng,
  svgToPng,
  svgToSvg,
} from "./utils.js";

const DEFAULT_FONT_CSS_URLS = [
  "https://cdn.digitalhumanai.top/slidagent/pptx-craft/assets/css/fonts.css",
];

function normalizeFontName(fontName = "") {
  return String(fontName).trim().replace(/['"]/g, "").toLowerCase();
}

function parseSrcUrls(srcValue = "", baseUrl = document.baseURI) {
  const urls = [];
  const regex = /url\(([^)]+)\)/g;
  let match = null;
  while ((match = regex.exec(srcValue))) {
    const raw = match[1].trim().replace(/^['"]|['"]$/g, "");
    if (!raw || raw.startsWith("data:")) continue;
    try {
      urls.push(new URL(raw, baseUrl).toString());
    } catch {
      urls.push(raw);
    }
  }
  return urls;
}

function pickFontUrlByPriority(urls) {
  const extRank = { woff2: 5, woff: 4, ttf: 3, otf: 2, eot: 1 };
  const sorted = [...urls].sort((a, b) => {
    const extA = (a.split(".").pop() || "").split(/[?#]/)[0].toLowerCase();
    const extB = (b.split(".").pop() || "").split(/[?#]/)[0].toLowerCase();
    return (extRank[extB] || 0) - (extRank[extA] || 0);
  });
  return sorted[0] || null;
}

function parseFontFacesFromCssText(cssText = "", baseUrl = document.baseURI) {
  const result = [];
  const blocks = String(cssText).match(/@font-face\s*{[^}]*}/gi) || [];
  for (const block of blocks) {
    const familyMatch = block.match(/font-family\s*:\s*([^;]+);?/i);
    const srcMatch = block.match(/src\s*:\s*([^;]+);?/i);
    if (!familyMatch || !srcMatch) continue;

    const resolvedFamily = resolvePptxFontFace(familyMatch[1]);
    const urls = parseSrcUrls(srcMatch[1], baseUrl);
    const bestUrl = pickFontUrlByPriority(urls);
    if (resolvedFamily && bestUrl) {
      result.push({ name: resolvedFamily, url: bestUrl });
    }
  }
  return result;
}

async function collectFontFaceUrlMap() {
  const fontUrlMap = new Map();

  const putFace = (face) => {
    const key = normalizeFontName(face?.name);
    if (!key || fontUrlMap.has(key) || !face?.url) return;
    fontUrlMap.set(key, face);
  };

  for (const sheet of Array.from(document.styleSheets || [])) {
    let rules;
    try {
      rules = sheet.cssRules || [];
    } catch {
      continue;
    }
    for (const rule of Array.from(rules)) {
      // CSSFontFaceRule = 5
      if (rule.type !== 5) continue;
      const family = rule.style?.getPropertyValue("font-family");
      const src = rule.style?.getPropertyValue("src");
      if (!family || !src) continue;

      const resolvedFamily = resolvePptxFontFace(family);
      const key = normalizeFontName(resolvedFamily);
      if (!key || fontUrlMap.has(key)) continue;

      const baseUrl = sheet.href || document.baseURI;
      const urls = parseSrcUrls(src, baseUrl);
      const bestUrl = pickFontUrlByPriority(urls);
      if (bestUrl) putFace({ name: resolvedFamily, url: bestUrl });
    }
  }

  // 补充：解析 <style> 内联文本中的 @font-face
  for (const styleEl of Array.from(document.querySelectorAll("style"))) {
    const faces = parseFontFacesFromCssText(styleEl.textContent || "", document.baseURI);
    for (const face of faces) putFace(face);
  }

  // 补充：尝试抓取可跨域访问的外链样式表，解析 @font-face
  for (const linkEl of Array.from(document.querySelectorAll('link[rel="stylesheet"][href]'))) {
    const href = linkEl.getAttribute("href");
    if (!href) continue;
    let cssUrl = href;
    try {
      cssUrl = new URL(href, document.baseURI).toString();
    } catch {
      // keep raw href
    }
    try {
      const resp = await fetch(cssUrl, { mode: "cors" });
      if (!resp.ok) continue;
      const cssText = await resp.text();
      const faces = parseFontFacesFromCssText(cssText, cssUrl);
      for (const face of faces) putFace(face);
    } catch {
      // CORS 或网络失败时静默跳过
    }
  }

  // 兜底：即使页面没引入 fonts.css，也尝试从默认字体清单抓取可嵌入字体
  for (const cssUrl of DEFAULT_FONT_CSS_URLS) {
    try {
      const resp = await fetch(cssUrl, { mode: "cors" });
      if (!resp.ok) continue;
      const cssText = await resp.text();
      const faces = parseFontFacesFromCssText(cssText, cssUrl);
      for (const face of faces) putFace(face);
    } catch {
      // 网络/CORS 异常时跳过
    }
  }

  return fontUrlMap;
}

function collectUsedFontNames(elements) {
  const used = new Set();
  for (const root of elements) {
    if (!root || root.nodeType !== 1) continue;
    const allNodes = [root, ...Array.from(root.querySelectorAll("*"))];
    for (const node of allNodes) {
      const style = window.getComputedStyle(node);
      const resolved = resolvePptxFontFace(style.fontFamily);
      if (resolved) used.add(normalizeFontName(resolved));
    }
  }
  return used;
}

async function collectAutoFonts(elements) {
  const usedNames = collectUsedFontNames(elements);
  if (!usedNames.size) return [];
  const faceMap = await collectFontFaceUrlMap();
  const fonts = [];
  for (const key of usedNames) {
    const face = faceMap.get(key);
    if (face) fonts.push(face);
  }
  return fonts;
}

/**
 * Main export function.
 * @param {HTMLElement | string | Array<HTMLElement | string>} target
 * @param {Object} options
 * @param {string} [options.fileName]
 * @param {boolean} [options.skipDownload=false] - If true, prevents automatic download
 * @param {Object} [options.listConfig] - Config for bullets
 * @param {boolean} [options.svgAsVector=false] - If true, keeps SVG as vector (for Convert to Shape in PowerPoint)
 * @param {boolean} [options.svgAsEditable=false] - If true, converts SVG elements to editable PPTX shapes and text
 *        using svg-to-pptx. SVG paths become editable shapes, text becomes editable text boxes in PowerPoint.
 *        This option takes precedence over svgAsVector when both are true.
 * @param {boolean} [options.autoEmbedFonts=true] - If true, auto-detect and embed fonts used in the DOM
 * @param {Array<{name: string, url: string}>} [options.fonts] - Explicit fonts to embed
 * @param {string} [options.author] - Document author
 * @param {string} [options.company] - Company name
 * @param {string} [options.title] - Document title
 * @param {string} [options.subject] - Document subject
 * @returns {Promise<Blob>} - Returns the generated PPTX Blob
 */
export async function exportToPptx(target, options = {}) {
  // 默认启用字体嵌入
  options = { autoEmbedFonts: true, ...options };
  // 动态导入 processSlide 以避免循环依赖
  const { processSlide } = await import("./converter/slide.js");

  const resolvePptxConstructor = (pkg) => {
    if (!pkg) return null;
    if (typeof pkg === "function") return pkg;
    if (pkg && typeof pkg.default === "function") return pkg.default;
    if (pkg && typeof pkg.PptxGenJS === "function") return pkg.PptxGenJS;
    if (pkg && pkg.PptxGenJS && typeof pkg.PptxGenJS.default === "function") return pkg.PptxGenJS.default;
    return null;
  };

  const PptxConstructor = resolvePptxConstructor(PptxGenJS);
  if (!PptxConstructor) throw new Error("PptxGenJS constructor not found.");

  // 使用字体嵌入增强的 pptxgenjs 类
  const EnhancedPptx = await withPPTXEmbedFonts(PptxConstructor);
  const pptx = new EnhancedPptx();
  pptx.layout = "LAYOUT_16x9";

  // 设置文档属性
  if (options.author) pptx.author = options.author;
  if (options.company) pptx.company = options.company;
  if (options.title) pptx.title = options.title;
  if (options.subject) pptx.subject = options.subject;

  const elements = Array.isArray(target) ? target : [target];

  for (let i = 0; i < elements.length; i++) {
    try {
      const root = typeof elements[i] === "string" ? document.querySelector(elements[i]) : elements[i];
      if (!root) {
        console.warn("Element not found, skipping slide:", elements[i]);
        continue;
      }
      const slide = pptx.addSlide();
      // 页码从 1 开始
      const pageNum = i + 1;
      await processSlide(root, slide, pptx, options, pageNum);
    } catch (e) {
      console.warn("Error processing slide:", e);
      continue;
    }
  }

  // 字体嵌入逻辑：
  // 1) 自动收集 DOM 中实际使用且可从 @font-face 定位到 URL 的字体
  // 2) 合并用户显式传入字体（显式优先）
  if (options.autoEmbedFonts) {
    const explicitFonts = Array.isArray(options.fonts) ? options.fonts : [];
    const autoFonts = await collectAutoFonts(elements);

    const mergedFonts = [];
    const seen = new Set();
    const addUniqueFont = (fontCfg) => {
      if (!fontCfg || !fontCfg.name) return;
      const key = normalizeFontName(fontCfg.name);
      if (!key || seen.has(key)) return;
      seen.add(key);
      mergedFonts.push(fontCfg);
    };

    for (const fontCfg of explicitFonts) addUniqueFont(fontCfg);
    for (const fontCfg of autoFonts) addUniqueFont(fontCfg);

    for (const fontCfg of mergedFonts) {
      if (!fontCfg.buffer && fontCfg.url) {
        try {
          const response = await fetch(fontCfg.url);
          if (response.ok) {
            const buffer = await response.arrayBuffer();
            const ext = fontCfg.url.split(".").pop().split(/[?#]/)[0].toLowerCase();
            const type = ["woff2", "woff", "otf", "eot", "ttf"].includes(ext) ? ext : "ttf";
            await pptx.addFont({
              fontFace: fontCfg.name,
              fontFile: buffer,
              fontType: type,
            });
          }
        } catch (e) {
          console.warn(`Failed to fetch explicit font: ${fontCfg.name}`, e);
        }
      } else if (fontCfg.buffer) {
        try {
          await pptx.addFont({
            fontFace: fontCfg.name,
            fontFile: fontCfg.buffer,
            fontType: fontCfg.type || "ttf",
          });
        } catch (e) {
          console.warn(`Failed to register font: ${fontCfg.name}`, e);
        }
      }
    }
  }

  // write() 会被 withPPTXEmbedFonts 覆盖，自动完成字体嵌入
  const finalBlob = await pptx.write({ outputType: "blob" });

  // Output Handling
  // If skipDownload is NOT true, proceed with browser download
  if (!options.skipDownload) {
    const fileName = options.fileName || "export.pptx";
    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Always return the blob so the caller can use it (e.g. upload to server)
  return finalBlob;
}
