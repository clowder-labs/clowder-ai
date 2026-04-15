#!/usr/bin/env node
/**
 * PPT 空白率检测脚本
 *
 * 使用 Playwright 渲染 HTML 页面，递归遍历 .ppt-slide 内所有后代元素，
 * 通过视觉穿透算法计算每个元素内真正可见内容的纵向跨度，
 * 当可见内容跨度远小于元素自身高度时，标记为空白元素。
 *
 * 标记方案：通过预注入 data-ws-id 唯一标识符精确定位元素，
 * 避免 DOM 动态生成导致与原始 HTML 不一致的问题。
 *
 * 标签格式：whitespace_detected
 *
 * 用法：
 *   node analyze-whitespace.js <文件或目录>
 *   node analyze-whitespace.js <文件或目录> --threshold=70%,40px
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { log, warn, error, configureFromArgs } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI 参数解析 ────────────────────────────────────────────

const args = process.argv.slice(2);
const targetPath = args.find(a => !a.startsWith('--'));
const thresholdArg = args.find(a => a.startsWith('--threshold='));

// 解析日志级别（--verbose / --quiet / --silent）
configureFromArgs(args);

// 默认阈值：70% 且 40px（填充率低于 70% 且空白量超过 40px 算作空白）
let thresholdPercent = 70;
let thresholdPx = 40;

if (thresholdArg) {
  const val = thresholdArg.split('=')[1];
  const match = val.match(/^(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)px$/);
  if (match) {
    thresholdPercent = parseFloat(match[1]);
    thresholdPx = parseFloat(match[2]);
  } else {
    error(`无效阈值格式: ${val}，应为 "70%,40px"`);
    process.exit(1);
  }
}

if (!targetPath) {
  error('用法: node analyze-whitespace.js <文件或目录> [--threshold=70%,40px]');
  process.exit(1);
}

// ─── 文件收集 ────────────────────────────────────────────────

function collectFiles(target) {
  if (!fs.existsSync(target)) {
    error(`错误：路径不存在 - ${target}`);
    process.exit(1);
  }

  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (target.endsWith('.html') || target.endsWith('.htm')) return [target];
    error('错误：非 HTML 文件');
    process.exit(1);
  }

  if (stat.isDirectory()) {
    const files = [];
    function scan(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
        } else if (entry.isFile() && (entry.name.endsWith('.html') || entry.name.endsWith('.htm'))) {
          files.push(full);
        }
      }
    }
    scan(target);
    return files;
  }

  error(`无效路径：${target}`);
  process.exit(1);
}

// ─── HTML 预处理：注入唯一标识符 ──────────────────────────────

const WS_ID_ATTR = 'data-ws-id';
const TAG = 'whitespace_detected';
const SELF_CLOSING_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
const SLIDE_SELECTOR = '.ppt-slide[type="content"]';
const WS_ID_CLEANUP_RE = new RegExp(`\\s+${WS_ID_ATTR}=["'][^"']*["']`, 'g');

/**
 * 给 HTML 中所有开始标签注入 data-ws-id="N" 唯一标识符
 * @param {string} html 原始 HTML
 * @returns {{ html: string, count: number }} 带标识符的 HTML 和注入数量
 */
function injectWsIds(html) {
  let counter = 0;

  const result = html.replace(/<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)(\s*\/?)>/g, (match, tagName, attrs, closing) => {
    if (SELF_CLOSING_TAGS.has(tagName.toLowerCase())) return match;
    if (/\bdata-ws-id\s*=/.test(attrs)) return match;
    counter++;
    return `<${tagName}${attrs} ${WS_ID_ATTR}="${counter}"${closing}>`;
  });

  return { html: result, count: counter };
}

// ─── 清理旧标记 ──────────────────────────────────────────────

/**
 * 移除 HTML 中所有 whitespace_detected class 标记
 * 支持重复检测：先清理再重新检测
 * @param {string} html 原始 HTML
 * @returns {string} 清理后的 HTML
 */
function removeWhitespaceClass(html) {
  let result = html;

  const tagRe = new RegExp(`\\b${TAG}\\b\\s*`, 'g');
  result = result.replace(/(\bclass=["'])([^"']*)(["'])/g, (match, open, classes, close) => {
    const cleaned = classes.replace(tagRe, '').trim();
    if (cleaned.length === 0) return '';
    return `${open}${cleaned.replace(/\s+/g, ' ')}${close}`;
  });

  // 移除空的 class="" 或 class=''
  result = result.replace(/\s+class=(["'])\1/g, '');

  return result;
}

// ─── 空白率检测 ──────────────────────────────────────────────

/**
 * 在页面中检测空白率过高的元素
 * 递归遍历 .ppt-slide[type="content"] 内所有后代元素
 *
 * 注意：必须使用 page.goto 加载 file:// 协议的临时文件，
 * 而非 page.setContent，因为 setContent 无法加载相对路径的本地资源
 * （tailwind.js、fontawesome 等），导致布局错误。
 *
 * @param {import('playwright').Page} page Playwright 页面实例
 * @param {string} htmlFilePath 原始 HTML 文件路径（用于确定临时文件位置）
 * @param {string} taggedHtml 预注入了 data-ws-id 的 HTML 内容
 * @param {number} percentThreshold 填充率阈值（百分比）
 * @param {number} pxThreshold 空白量阈值（像素）
 * @returns {Promise<Array>} 检测结果数组
 */
async function detectWhitespace(page, htmlFilePath, taggedHtml, percentThreshold, pxThreshold) {
  const tmpPath = htmlFilePath + '.ws-tmp.html';
  fs.writeFileSync(tmpPath, taggedHtml, 'utf-8');

  try {
    await page.goto(`file://${path.resolve(tmpPath)}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1500);

    const results = await page.evaluate(({ percentThreshold: pct, pxThreshold: px, wsIdAttr, slideSel }) => {
      const results = [];

      function isColorTransparent(color) {
        if (!color) return true;
        const c = color.trim().toLowerCase();
        return c === 'transparent' || c === 'rgba(0, 0, 0, 0)' || c === 'rgba(0,0,0,0)';
      }

      /** 获取元素的 class 字符串（兼容 SVG 元素的 className.baseVal） */
      function getClassStr(el) {
        return typeof el.className === 'string' ? el.className : (el.className?.baseVal ?? '');
      }

      /** 获取文本节点的包围盒（相对于 containerRect） */
      function getTextNodeBounds(textNode, containerRect) {
        const text = (textNode.textContent || '').trim();
        if (text.length === 0) return null;
        const range = document.createRange();
        range.selectNodeContents(textNode);
        const rect = range.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;
        return { top: rect.top - containerRect.top, bottom: rect.bottom - containerRect.top };
      }

      function analyzeVisualContribution(el) {
        const style = getComputedStyle(el);
        const result = { fullBounds: false, contributesTop: false, contributesBottom: false };

        if (!isColorTransparent(style.backgroundColor)) {
          result.fullBounds = true;
          return result;
        }

        const text = (el.textContent || '').trim();
        if (text.length > 0 && !isColorTransparent(style.color)) {
          result.fullBounds = true;
          return result;
        }

        const tag = el.tagName.toLowerCase();
        if (['img', 'video', 'canvas', 'svg'].includes(tag)) {
          result.fullBounds = true;
          return result;
        }

        if (/\bfa-[a-z]/.test(getClassStr(el))) {
          result.fullBounds = true;
          return result;
        }

        const hasLeftBorder = parseFloat(style.borderLeftWidth) > 0 && !isColorTransparent(style.borderLeftColor);
        const hasRightBorder = parseFloat(style.borderRightWidth) > 0 && !isColorTransparent(style.borderRightColor);
        if (hasLeftBorder || hasRightBorder) {
          result.fullBounds = true;
          return result;
        }

        if (parseFloat(style.borderTopWidth) > 0 && !isColorTransparent(style.borderTopColor)) {
          result.contributesTop = true;
        }
        if (parseFloat(style.borderBottomWidth) > 0 && !isColorTransparent(style.borderBottomColor)) {
          result.contributesBottom = true;
        }

        return result;
      }

      function getVisualBounds(el, containerRect) {
        const rect = el.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return null;

        const contrib = analyzeVisualContribution(el);

        if (contrib.fullBounds) {
          return { top: rect.top - containerRect.top, bottom: rect.bottom - containerRect.top };
        }

        let childMinTop = Infinity;
        let childMaxBottom = -Infinity;
        let hasVisibleChild = false;

        for (const child of el.childNodes) {
          if (child.nodeType === 1) {
            const bounds = getVisualBounds(child, containerRect);
            if (bounds) {
              childMinTop = Math.min(childMinTop, bounds.top);
              childMaxBottom = Math.max(childMaxBottom, bounds.bottom);
              hasVisibleChild = true;
            }
          } else if (child.nodeType === 3) {
            const bounds = getTextNodeBounds(child, containerRect);
            if (bounds) {
              childMinTop = Math.min(childMinTop, bounds.top);
              childMaxBottom = Math.max(childMaxBottom, bounds.bottom);
              hasVisibleChild = true;
            }
          }
        }

        if (!contrib.contributesTop && !contrib.contributesBottom) {
          if (!hasVisibleChild) return null;
          return { top: childMinTop, bottom: childMaxBottom };
        }

        const relTop = rect.top - containerRect.top;
        const relBottom = rect.bottom - containerRect.top;

        if (!hasVisibleChild) {
          const style = getComputedStyle(el);
          if (contrib.contributesTop && contrib.contributesBottom) {
            return { top: relTop, bottom: relBottom };
          } else if (contrib.contributesTop) {
            return { top: relTop, bottom: relTop + parseFloat(style.borderTopWidth) };
          } else {
            return { top: relBottom - parseFloat(style.borderBottomWidth), bottom: relBottom };
          }
        }

        return {
          top: contrib.contributesTop ? Math.min(relTop, childMinTop) : childMinTop,
          bottom: contrib.contributesBottom ? Math.max(relBottom, childMaxBottom) : childMaxBottom,
        };
      }

      // ── 空白率检测主循环 ──

      const slides = document.querySelectorAll(slideSel);
      if (slides.length === 0) return results;

      for (const slide of slides) {
        const elements = slide.querySelectorAll('*');
        for (const el of elements) {
          const containerRect = el.getBoundingClientRect();
          const containerHeight = el.clientHeight;
          if (containerHeight <= 0) continue;

          let minTop = Infinity;
          let maxBottom = -Infinity;
          let hasVisibleChild = false;

          for (const child of el.childNodes) {
            if (child.nodeType === 1) {
              const bounds = getVisualBounds(child, containerRect);
              if (bounds) {
                minTop = Math.min(minTop, bounds.top);
                maxBottom = Math.max(maxBottom, bounds.bottom);
                hasVisibleChild = true;
              }
            } else if (child.nodeType === 3) {
              const bounds = getTextNodeBounds(child, containerRect);
              if (bounds) {
                minTop = Math.min(minTop, bounds.top);
                maxBottom = Math.max(maxBottom, bounds.bottom);
                hasVisibleChild = true;
              }
            }
          }

          if (!hasVisibleChild) continue;

          const childrenSpan = maxBottom - minTop;
          if (childrenSpan <= 0) continue;

          const whitespace = containerHeight - childrenSpan;
          const spanRatio = (childrenSpan / containerHeight) * 100;
          if (spanRatio < pct && whitespace > px) {
            const wsId = el.getAttribute(wsIdAttr) || '';

            const pathParts = [];
            let current = el;
            while (current && current !== slide) {
              const t = current.tagName.toLowerCase();
              const cls = typeof current.className === 'string'
                ? current.className.split(/\s+/).filter(Boolean).join('.')
                : '';
              pathParts.unshift(cls ? `${t}.${cls}` : t);
              current = current.parentElement;
            }

            results.push({
              domPath: pathParts.join(' → '),
              containerHeight: Math.round(containerHeight),
              childrenSpan: Math.round(childrenSpan * 10) / 10,
              whitespace: Math.round(whitespace * 10) / 10,
              spanRatio: Math.round(spanRatio * 10) / 10,
              whitespaceRatio: Math.round((whitespace / containerHeight) * 1000) / 10,
              wsId,
            });
          }
        }
      }

      return results;
    }, { percentThreshold, pxThreshold, wsIdAttr: WS_ID_ATTR, slideSel: SLIDE_SELECTOR });

    return results;
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

// ─── HTML 后处理：标记空白元素 + 清理标识符 ────────────────────

/**
 * 在原始 HTML 中按 data-ws-id 精确定位空白元素，添加 whitespace_detected class，
 * 然后移除所有 data-ws-id 属性
 * @param {string} html 注入了 data-ws-id 的 HTML
 * @param {Array} whitespaces 检测结果数组（含 wsId）
 * @returns {string} 清理后的 HTML
 */
function applyAndCleanup(html, whitespaces) {
  let result = html;

  // 第一步：给空白元素添加 whitespace_detected class（按 data-ws-id 精确定位）
  const wsIdSet = new Set(whitespaces.map(w => w.wsId).filter(Boolean));
  for (const wsId of wsIdSet) {
    // 找到包含特定 data-ws-id 的整个开始标签
    const tagRe = new RegExp(
      `(<[a-zA-Z][a-zA-Z0-9]*\\s[^>]*\\b${WS_ID_ATTR}=["']${wsId}["'][^>]*>)`,
      's'
    );
    const tagMatch = result.match(tagRe);
    if (!tagMatch) continue;

    const fullTag = tagMatch[1];

    if (/\bclass=["']/.test(fullTag)) {
      // 已有 class 属性：在 class 值末尾追加
      const newTag = fullTag.replace(/(\bclass=["'])([^"']*)(["'])/, (m, open, cls, close) => {
        if (cls.split(/\s+/).includes(TAG)) return m;
        return `${open}${cls} ${TAG}${close}`;
      });
      result = result.replace(fullTag, newTag);
    } else {
      // 没有 class 属性：在 data-ws-id 后面插入 class
      const newTag = fullTag.replace(
        new RegExp(`(\\b${WS_ID_ATTR}=["']${wsId}["'])`),
        `$1 class="${TAG}"`
      );
      result = result.replace(fullTag, newTag);
    }
  }

  // 第二步：移除所有 data-ws-id 属性
  result = result.replace(new RegExp(`\\s+${WS_ID_ATTR}=["'][^"']*["']`, 'g'), '');

  return result;
}

// ─── 主流程 ──────────────────────────────────────────────────

async function main() {
  const files = collectFiles(targetPath);
  if (files.length === 0) {
    warn('未找到 HTML 文件');
    process.exit(0);
  }

  log('🔍 空白率检测');
  log(`📁 目标: ${targetPath} (${files.length} 个文件)`);
  log(`📏 阈值: <${thresholdPercent}% 且 >${thresholdPx}px`);
  log('='.repeat(50));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  let totalFiles = 0;
  let filesWithWhitespace = 0;
  let totalWhitespaces = 0;
  let hasError = false;

  for (const file of files) {
    const fileName = path.basename(file);
    totalFiles++;

    try {
      // 读取原始 HTML
      const rawHtml = fs.readFileSync(file, 'utf-8');

      // 先清理上一次检测可能残留的 whitespace_detected 标记（支持重复检测）
      const cleanHtml = removeWhitespaceClass(rawHtml);

      // 预注入唯一标识符
      const { html: taggedHtml } = injectWsIds(cleanHtml);

      // 用带标识符的 HTML 进行检测
      const whitespaces = await detectWhitespace(page, file, taggedHtml, thresholdPercent, thresholdPx);

      if (whitespaces.length === 0) {
        // 无空白：如果有旧标记被清理过，写回清理后的版本
        if (cleanHtml !== rawHtml) {
          fs.writeFileSync(file, cleanHtml, 'utf-8');
        }
        log(`\n📄 ${fileName} — ✅ 无空白`);
        continue;
      }

      // 在注入了标识符的 HTML 上添加 class，然后清理标识符
      const finalHtml = applyAndCleanup(taggedHtml, whitespaces);
      fs.writeFileSync(file, finalHtml, 'utf-8');

      filesWithWhitespace++;
      totalWhitespaces += whitespaces.length;
      log(`\n📄 ${fileName} — 检测到 ${whitespaces.length} 处空白`);

      for (const w of whitespaces) {
        log(`\n  ⬜ ${w.domPath}`);
        log(`     元素高度: ${w.containerHeight}px  子元素跨度: ${w.childrenSpan}px  空白: ${w.whitespace}px (填充率: ${w.spanRatio}%)`);
      }
    } catch (err) {
      hasError = true;
      warn(`\n📄 ${fileName} — ⚠️ 检测失败: ${err.message}`);
    }
  }

  await browser.close();

  // 统计
  log('\n' + '='.repeat(50));
  log('📊 统计：');
  log(`   检查文件：${totalFiles}`);
  log(`   有空白：${filesWithWhitespace}`);
  log(`   空白总数：${totalWhitespaces}`);

  if (hasError) {
    warn('\n⚠️  部分文件检测失败');
    process.exit(2);
  }

  if (filesWithWhitespace > 0) {
    process.exit(0);
  }

  log('\n✨ 所有文件无空白');
}

export { detectWhitespace };

// 只在直接运行时执行 main，被 import 时不执行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(err => {
    error('致命错误:', err);
    process.exit(2);
  });
}
