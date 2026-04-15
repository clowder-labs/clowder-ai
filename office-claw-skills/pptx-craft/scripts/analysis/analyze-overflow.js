#!/usr/bin/env node
/**
 * PPT 纵向溢出检测脚本
 *
 * 使用 Playwright 渲染 HTML 页面，遍历 DOM 元素检测 scrollHeight > clientHeight，
 * 通过双重阈值（比例 + 绝对值）过滤噪声，给溢出元素打上 class 标签并输出报告。
 *
 * 标签格式：y_axis_overflow_detected
 *
 * 用法：
 *   node detect-overflow.js <文件或目录>
 *   node detect-overflow.js <文件或目录> --threshold=5%,10px
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

// 默认阈值：5% 且 10px
let thresholdPercent = 5;
let thresholdPx = 10;

if (thresholdArg) {
  const val = thresholdArg.split('=')[1];
  const match = val.match(/^(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)px$/);
  if (match) {
    thresholdPercent = parseFloat(match[1]);
    thresholdPx = parseFloat(match[2]);
  } else {
    error(`无效阈值格式: ${val}，应为 "5%,10px"`);
    process.exit(1);
  }
}

if (!targetPath) {
  error('用法: node detect-overflow.js <文件或目录> [--threshold=5%,10px]');
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
    const files = fs.readdirSync(target)
      .filter(f => f.endsWith('.html') || f.endsWith('.htm'))
      .map(f => path.join(target, f));
    return files;
  }

  error(`无效路径：${target}`);
  process.exit(1);
}

// ─── 溢出检测 ────────────────────────────────────────────────

/**
 * 在页面中检测纵向溢出元素
 * 只扫描 .ppt-slide 内部元素
 */
async function detectOverflow(page, htmlPath, percentThreshold, pxThreshold) {
  const absPath = path.resolve(htmlPath);
  await page.goto(`file://${absPath}`, { waitUntil: 'load', timeout: 60000 });
  // 等待 Tailwind CDN 等样式生效
  await page.waitForTimeout(1500);

  // 隐藏脱离文档流的元素（absolute/fixed），避免干扰溢出检测
  await page.evaluate(() => {
    const slides = document.querySelectorAll('.ppt-slide');
    const excluded = [];
    for (const slide of slides) {
      const all = slide.querySelectorAll('*');
      for (const el of all) {
        const pos = getComputedStyle(el).position;
        if (pos === 'absolute' || pos === 'fixed') {
          excluded.push({ el, originalDisplay: el.style.display });
          el.style.display = 'none';
        }
      }
    }
    window.__overflowExcluded = excluded;
  });

  // 先清除之前可能存在的标签
  await page.evaluate(() => {
    document.querySelectorAll('.y_axis_overflow_detected').forEach(el => {
      el.classList.remove('y_axis_overflow_detected');
    });
  });

  const results = await page.evaluate(({ percentThreshold: pct, pxThreshold: px }) => {
    const results = [];
    const TAG = 'y_axis_overflow_detected';

    // 找到所有 ppt-slide 容器
    const slides = document.querySelectorAll('.ppt-slide');
    if (slides.length === 0) return results;

    for (const slide of slides) {
      // 遍历 slide 内所有后代元素
      const elements = slide.querySelectorAll('*');
      for (const el of elements) {
        const sH = el.scrollHeight;
        const cH = el.clientHeight;
        const overflow = sH - cH;

        if (overflow <= 0) continue;

        const ratio = overflow / cH;
        // 双重阈值：比例和绝对值同时超过才报告
        if (ratio * 100 > pct && overflow > px) {
          // 给溢出元素打标签（仅在 DOM 临时添加，不写回文件）
          el.classList.add(TAG);

          // 收集元素标识信息，用于文本替换
          const tagName = el.tagName.toLowerCase();
          const id = el.id || '';
          const className = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
          // 取前3个class作为定位特征
          const classParts = className.split(/\s+/).filter(Boolean);
          const sigClass = classParts.slice(0, 3).join(' ');

          // 构建 DOM 路径（带 class 名）
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
            scrollHeight: sH,
            clientHeight: cH,
            overflow: Math.round(overflow * 10) / 10,
            ratio: Math.round(ratio * 1000) / 10,
            // 元素标识信息，用于文本定位
            tagName,
            id,
            sigClass,
          });
        }
      }
    }

    return results;
  }, { percentThreshold, pxThreshold });

  // 恢复被隐藏的脱离文档流元素
  await page.evaluate(() => {
    if (window.__overflowExcluded) {
      for (const { el, originalDisplay } of window.__overflowExcluded) {
        el.style.display = originalDisplay;
      }
      delete window.__overflowExcluded;
    }
  });

  return results;
}

// ─── 文本替换：给溢出元素添加 class 标记 ──────────────────────

const TAG = 'y_axis_overflow_detected';

/**
 * 在原始 HTML 文本中查找对应元素并添加 y_axis_overflow_detected class
 * @param {string} html 原始 HTML 文本
 * @param {Array} overflows 检测结果数组（含 tagName, id, sigClass）
 * @returns {string} 修改后的 HTML
 */
function injectOverflowClass(html, overflows) {
  let result = html;

  for (const { tagName, id, sigClass } of overflows) {
    // 构建正则：匹配带 id 或 class 的开始标签
    // 优先用 id 定位（最精确）
    if (id) {
      const re = new RegExp(
        `(<${tagName}[^>]*\\bid\\s*=\\s*["']${escapeRegExp(id)}["'][^>]*?)(\\s*class\\s*=\\s*["'])([^"']*)(["'][^>]*>)`,
        's'
      );
      result = result.replace(re, (match, prefix, classAttr, existingClasses, suffix) => {
        if (existingClasses.split(/\s+/).includes(TAG)) {
          return match; // 已有标记，跳过
        }
        return `${prefix}${classAttr}${existingClasses} ${TAG}${suffix}`;
      });
    } else if (sigClass) {
      // 无 id 时，用 sigClass（前3个class）定位
      // 匹配 class="sigClass ..." 或 class="... sigClass ..."
      const sigParts = sigClass.split(/\s+/);
      for (const part of sigParts) {
        const re = new RegExp(
          `(<${tagName}[^>]*?class\\s*=\\s*["'])([^"']*\\b${escapeRegExp(part)}\\b[^"']*)(["'][^>]*>)`,
          's'
        );
        result = result.replace(re, (match, classAttr, existingClasses, suffix) => {
          if (existingClasses.split(/\s+/).includes(TAG)) {
            return match;
          }
          return `${classAttr}${existingClasses} ${TAG}${suffix}`;
        });
      }
    }
  }

  return result;
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── 主流程 ──────────────────────────────────────────────────

async function main() {
  const files = collectFiles(targetPath);
  if (files.length === 0) {
    warn('未找到 HTML 文件');
    process.exit(0);
  }

  log('🔍 纵向溢出检测');
  log(`📁 目标: ${targetPath} (${files.length} 个文件)`);
  log(`📏 阈值: >${thresholdPercent}% 且 >${thresholdPx}px`);
  log('='.repeat(50));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  let totalFiles = 0;
  let filesWithOverflow = 0;
  let totalOverflows = 0;
  let hasError = false;

  for (const file of files) {
    const fileName = path.basename(file);
    totalFiles++;

    try {
      const overflows = await detectOverflow(page, file, thresholdPercent, thresholdPx);

      // 如果有溢出，用文本替换给对应元素的 class 添加标记（避免引入 page.content() 带来的渲染产物）
      if (overflows.length > 0) {
        const originalHtml = fs.readFileSync(file, 'utf-8');
        const modifiedHtml = injectOverflowClass(originalHtml, overflows);
        fs.writeFileSync(file, modifiedHtml, 'utf-8');
      }

      if (overflows.length === 0) {
        log(`\n📄 ${fileName} — ✅ 无溢出`);
        continue;
      }

      filesWithOverflow++;
      totalOverflows += overflows.length;
      log(`\n📄 ${fileName} — 检测到 ${overflows.length} 处溢出`);

      for (const o of overflows) {
        log(`\n  ❌ ${o.domPath}`);
        log(`     scrollHeight: ${o.scrollHeight}px  clientHeight: ${o.clientHeight}px  溢出: ${o.overflow}px (${o.ratio}%)`);
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
  log(`   有溢出：${filesWithOverflow}`);
  log(`   溢出总数：${totalOverflows}`);

  if (hasError) {
    warn('\n⚠️  部分文件检测失败');
    process.exit(2);
  }

  if (filesWithOverflow > 0) {
    process.exit(0);
  }

  log('\n✨ 所有文件无溢出');
}


export { detectOverflow };

// 只在直接运行时执行 main，被 import 时不执行
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(err => {
    error('致命错误:', err);
    process.exit(2);
  });
}
