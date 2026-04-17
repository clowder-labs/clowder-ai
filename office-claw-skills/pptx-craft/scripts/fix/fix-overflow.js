#!/usr/bin/env node
/**
 * PPT 纵向溢出自动修复脚本
 *
 * 基于 detect-overflow.js 的检测结果，通过逐层逐类型降低 Tailwind spacing 类
 * （margin、padding、gap、space）来修复纵向溢出。
 * 每步降级后立即检测，溢出消除即停止。
 *
 * 用法：
 *   node fix-overflow.js <文件或目录>
 *   node fix-overflow.js <文件或目录> --timeout=300
 *   node fix-overflow.js <文件或目录> --threshold=5%,10px
 *   node fix-overflow.js <文件或目录> --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { detectOverflow } from '../analysis/analyze-overflow.js';
import { log, warn, error, configureFromArgs } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI 参数解析 ────────────────────────────────────────────

const args = process.argv.slice(2);
configureFromArgs(args);
const targetPath = args.find(a => !a.startsWith('--'));
const timeoutArg = args.find(a => a.startsWith('--timeout='));
const thresholdArg = args.find(a => a.startsWith('--threshold='));
const dryRun = args.includes('--dry-run');

const timeout = timeoutArg ? parseInt(timeoutArg.split('=')[1], 10) : 300;

// 检测阈值
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
  error('用法: node fix-overflow.js <文件或目录> [--timeout=300] [--threshold=5%,10px] [--dry-run]');
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

// ─── 降级引擎 ──────────────────────────────────────────────

/**
 * spacing 类型的正则定义（字符串形式，用于传递给 page.evaluate）
 * 每个类型包含标准数字类的 pattern 字符串和任意值类的 pattern 字符串
 */
const SPACING_TYPES = {
  margin: {
    name: 'margin',
    patterns: [
      '\\bm-(\\d+)\\b',
      '\\bmx-(\\d+)\\b',
      '\\bmy-(\\d+)\\b',
      '\\bmt-(\\d+)\\b',
      '\\bmb-(\\d+)\\b',
      '\\bml-(\\d+)\\b',
      '\\bmr-(\\d+)\\b',
    ],
    arbitraryPatterns: [
      '\\bm-\\[([^\\]]+)\\]',
      '\\bmx-\\[([^\\]]+)\\]',
      '\\bmy-\\[([^\\]]+)\\]',
      '\\bmt-\\[([^\\]]+)\\]',
      '\\bmb-\\[([^\\]]+)\\]',
      '\\bml-\\[([^\\]]+)\\]',
      '\\bmr-\\[([^\\]]+)\\]',
    ],
  },
  padding: {
    name: 'padding',
    patterns: [
      '\\bp-(\\d+)\\b',
      '\\bpx-(\\d+)\\b',
      '\\bpy-(\\d+)\\b',
      '\\bpt-(\\d+)\\b',
      '\\bpb-(\\d+)\\b',
      '\\bpl-(\\d+)\\b',
      '\\bpr-(\\d+)\\b',
    ],
    arbitraryPatterns: [
      '\\bp-\\[([^\\]]+)\\]',
      '\\bpx-\\[([^\\]]+)\\]',
      '\\bpy-\\[([^\\]]+)\\]',
      '\\bpt-\\[([^\\]]+)\\]',
      '\\bpb-\\[([^\\]]+)\\]',
      '\\bpl-\\[([^\\]]+)\\]',
      '\\bpr-\\[([^\\]]+)\\]',
    ],
  },
  gap: {
    name: 'gap/space',
    patterns: [
      '\\bgap-(\\d+)\\b',
      '\\bgap-x-(\\d+)\\b',
      '\\bgap-y-(\\d+)\\b',
      '\\bspace-y-(\\d+)\\b',
      '\\bspace-x-(\\d+)\\b',
    ],
    arbitraryPatterns: [
      '\\bgap-\\[([^\\]]+)\\]',
      '\\bgap-x-\\[([^\\]]+)\\]',
      '\\bgap-y-\\[([^\\]]+)\\]',
      '\\bspace-y-\\[([^\\]]+)\\]',
      '\\bspace-x-\\[([^\\]]+)\\]',
    ],
  },
};

// ─── 字体降级配置 ──────────────────────────────────────────────

const TYPO_TYPES = {
  'font-size': {
    name: 'font-size',
    label: 'font-size',
    // 从大到小排列的 Tailwind 标准字号类
    tierList: [
      'text-9xl', 'text-8xl', 'text-7xl', 'text-6xl', 'text-5xl',
      'text-4xl', 'text-3xl', 'text-2xl', 'text-xl', 'text-lg',
      'text-base', 'text-sm', 'text-xs',
    ],
    tierMap: {
      'text-9xl': 128, 'text-8xl': 96, 'text-7xl': 72, 'text-6xl': 60,
      'text-5xl': 48, 'text-4xl': 36, 'text-3xl': 30, 'text-2xl': 24,
      'text-xl': 20, 'text-lg': 18, 'text-base': 16, 'text-sm': 14,
      'text-xs': 12,
    },
    // 匹配 text-[...] 任意值（不含斜杠）
    arbitraryPatterns: ['\\btext-\\[([^\\]/]+)\\]'],
    // 匹配 text-[Npx/LH] 斜杠语法的字体部分
    slashPattern: '\\btext-\\[([^\\]]+)/([^\\]]+)\\]',
    minPx: 10,        // 最小字号 px
    scaleFactor: 0.8, // 任意值缩小比例
    remToPx: 16,
    ptToPx: 96 / 72,
  },
  'line-height': {
    name: 'line-height',
    label: 'line-height',
    // 从大到小排列的倍数类（无单位）
    tierList: [
      'leading-loose', 'leading-relaxed', 'leading-normal',
      'leading-snug', 'leading-tight', 'leading-none',
    ],
    tierMap: {
      'leading-loose': 2, 'leading-relaxed': 1.625, 'leading-normal': 1.5,
      'leading-snug': 1.375, 'leading-tight': 1.25, 'leading-none': 1,
    },
    // 固定值类 leading-N（px），从大到小
    fixedTierList: [
      'leading-10', 'leading-9', 'leading-8', 'leading-7',
      'leading-6', 'leading-5', 'leading-4', 'leading-3',
    ],
    fixedTierMap: {
      'leading-10': 40, 'leading-9': 36, 'leading-8': 32,
      'leading-7': 28, 'leading-6': 24, 'leading-5': 20,
      'leading-4': 16, 'leading-3': 12,
    },
    arbitraryPatterns: ['\\bleading-\\[([^\\]]+)\\]'],
    minMultiplier: 1, // 最小倍数
    minPx: 10,        // 最小固定值 px
    scaleFactor: 0.8,
    remToPx: 16,
  },
};

/**
 * 将 CSS 值字符串解析为数值和单位
 * 支持: 16px, 1rem, 12pt, 1.5（无单位）
 * @returns {{ value: number, unit: string } | null}
 */
function parseCssValue(valStr) {
  const numMatch = valStr.match(/^(-?\d+(?:\.\d+)?)\s*(px|rem|em|pt)?$/);
  if (!numMatch) return null;
  return {
    value: parseFloat(numMatch[1]),
    unit: numMatch[2] || '',
  };
}

/**
 * 将解析后的 CSS 值转换为 px
 */
function toPx(parsed, remToPx, ptToPx) {
  if (parsed.unit === 'rem' || parsed.unit === 'em') return parsed.value * remToPx;
  if (parsed.unit === 'pt') return parsed.value * ptToPx;
  return parsed.value; // px 或无单位
}

/**
 * 处理排版降级步骤（font-size / line-height）
 * 在 page.evaluate 内执行，对溢出元素及所有后代生效
 * @param {import('playwright').Page} page
 * @param {string} typeName - 'font-size' | 'line-height'
 * @param {object} typoDef - TYPO_TYPES[typeName]
 * @returns {Promise<Array<{from: string, to: string}>>}
 */
async function processTypographyStep(page, typeName, typoDef) {
  return await page.evaluate(({ config }) => {
    const changes = [];
    const overflowEls = document.querySelectorAll('.y_axis_overflow_detected');

    // 辅助：将 CSS 值字符串解析为数值和单位
    function parseCssValueInner(valStr) {
      const numMatch = valStr.match(/^(-?\d+(?:\.\d+)?)\s*(px|rem|em|pt)?$/);
      if (!numMatch) return null;
      return { value: parseFloat(numMatch[1]), unit: numMatch[2] || '' };
    }

    // 辅助：将解析值转为 px
    function toPxInner(parsed) {
      if (parsed.unit === 'rem' || parsed.unit === 'em') return parsed.value * config.remToPx;
      if (parsed.unit === 'pt') return parsed.value * config.ptToPx;
      return parsed.value;
    }

    for (const overflowEl of overflowEls) {
      // 收集溢出元素及所有后代
      const targets = [overflowEl, ...overflowEl.querySelectorAll('*')];

      for (const el of targets) {
        const classList = Array.from(el.classList);

        if (config.name === 'font-size') {
          // --- 处理标准 tier 类 text-9xl → text-8xl 等 ---
          for (const cls of classList) {
            const idx = config.tierList.indexOf(cls);
            if (idx >= 0 && idx < config.tierList.length - 1) {
              el.classList.remove(cls);
              el.classList.add(config.tierList[idx + 1]);
              changes.push({ from: cls, to: config.tierList[idx + 1] });
            }
          }

          // --- 处理 text-[...] 任意值（不含斜杠）---
          const textArbitraryRe = new RegExp(config.arbitraryPatterns[0]);
          for (const cls of [...el.classList]) {
            const m = cls.match(textArbitraryRe);
            if (!m) continue;
            if (m[1].includes('/')) continue; // 斜杠语法单独处理
            const parsed = parseCssValueInner(m[1]);
            if (!parsed) continue;
            const px = toPxInner(parsed);
            if (px <= config.minPx) continue;

            const newPx = Math.max(px * config.scaleFactor, config.minPx);
            if (newPx >= px) continue;

            const newClass = `text-[${Math.round(newPx * 10) / 10}px]`;
            el.classList.remove(cls);
            el.classList.add(newClass);
            changes.push({ from: cls, to: newClass });
          }

          // --- 处理 text-[Npx/LH] 斜杠语法 ---
          const slashRe = new RegExp(config.slashPattern);
          for (const cls of [...el.classList]) {
            const m = cls.match(slashRe);
            if (!m) continue;
            const parsed = parseCssValueInner(m[1]);
            if (!parsed) continue;
            const px = toPxInner(parsed);
            if (px <= config.minPx) continue;

            const newPx = Math.max(px * config.scaleFactor, config.minPx);
            if (newPx >= px) continue;

            const newClass = `text-[${Math.round(newPx * 10) / 10}px/${m[2]}]`;
            el.classList.remove(cls);
            el.classList.add(newClass);
            changes.push({ from: cls, to: newClass });
          }
        }

        if (config.name === 'line-height') {
          // --- 处理倍数类 leading-loose → leading-relaxed 等 ---
          for (const cls of classList) {
            const idx = config.tierList.indexOf(cls);
            if (idx >= 0 && idx < config.tierList.length - 1) {
              el.classList.remove(cls);
              el.classList.add(config.tierList[idx + 1]);
              changes.push({ from: cls, to: config.tierList[idx + 1] });
            }
          }

          // --- 处理固定值类 leading-10 → leading-9 等 ---
          for (const cls of classList) {
            const idx = config.fixedTierList.indexOf(cls);
            if (idx >= 0 && idx < config.fixedTierList.length - 1) {
              el.classList.remove(cls);
              el.classList.add(config.fixedTierList[idx + 1]);
              changes.push({ from: cls, to: config.fixedTierList[idx + 1] });
            }
          }

          // --- 处理 leading-[...] 任意值 ---
          const leadArbitraryRe = new RegExp(config.arbitraryPatterns[0]);
          for (const cls of [...el.classList]) {
            const m = cls.match(leadArbitraryRe);
            if (!m) continue;
            const parsed = parseCssValueInner(m[1]);
            if (!parsed) continue;

            let newClass;
            if (!parsed.unit) {
              // 无单位：可能是倍数(如 1.5)或像素(如 24)
              if (parsed.value < 3) {
                // 倍数
                if (parsed.value <= config.minMultiplier) continue;
                const newVal = Math.max(parsed.value * config.scaleFactor, config.minMultiplier);
                if (newVal >= parsed.value) continue;
                newClass = `leading-[${Math.round(newVal * 1000) / 1000}]`;
              } else {
                // 像素（无单位的大数值）
                if (parsed.value <= config.minPx) continue;
                const newVal = Math.max(parsed.value * config.scaleFactor, config.minPx);
                if (newVal >= parsed.value) continue;
                newClass = `leading-[${Math.round(newVal * 10) / 10}px]`;
              }
            } else {
              // 有单位 (px, rem, em)
              const px = toPxInner(parsed);
              if (px <= config.minPx) continue;
              const newVal = Math.max(px * config.scaleFactor, config.minPx);
              if (newVal >= px) continue;
              newClass = `leading-[${Math.round(newVal * 10) / 10}${parsed.unit}]`;
            }

            el.classList.remove(cls);
            el.classList.add(newClass);
            changes.push({ from: cls, to: newClass });
          }
        }
      }
    }

    return changes;
  }, { config: typoDef });
}

// ─── 策略生成器 ──────────────────────────────────────────────

/**
 * 生成降级策略步骤
 * 第一阶段：溢出元素自身 + 子元素遍历 (depth 0 → maxDepth)
 * 第二阶段：父元素遍历 (depth -1 → -maxDepth)
 * 第三阶段：排版降级 — font-size 和 line-height 逐级降（仅溢出元素及后代）
 * @param {number} maxDepth - 最大遍历深度
 * @returns {Array<{depth: number|string, typeName: string, typeLabel: string}>}
 */
function generateStrategySteps(maxDepth = 10) {
  const types = [
    { key: 'margin', label: 'margin' },
    { key: 'padding', label: 'padding' },
    { key: 'gap', label: 'gap/space' },
  ];

  const steps = [];

  // 第一阶段：溢出元素自身 + 子元素遍历 (depth 0 → maxDepth)
  for (let depth = 0; depth <= maxDepth; depth++) {
    for (const type of types) {
      steps.push({
        depth,
        typeName: type.key,
        typeLabel: type.label,
      });
    }
  }

  // 第二阶段：父元素遍历 (depth -1 → -maxDepth)
  for (let depth = -1; depth >= -maxDepth; depth--) {
    for (const type of types) {
      steps.push({
        depth,
        typeName: type.key,
        typeLabel: type.label,
      });
    }
  }

  // 第三阶段：排版降级（font-size 逐级降，line-height 逐级降）
  // 对溢出元素及后代生效（depth='typo'），不处理父元素
  const TYPO_STEPS = [
    { key: 'font-size', label: 'font-size' },
    { key: 'line-height', label: 'line-height' },
  ];

  const maxTierSteps = Math.max(
    TYPO_TYPES['font-size'].tierList.length - 1,
    TYPO_TYPES['line-height'].tierList.length - 1,
    TYPO_TYPES['line-height'].fixedTierList.length - 1,
  );

  for (let i = 0; i < maxTierSteps; i++) {
    for (const t of TYPO_STEPS) {
      steps.push({
        depth: 'typo',
        typeName: t.key,
        typeLabel: t.label,
      });
    }
  }

  return steps;
}

// ─── 文本替换工具 ──────────────────────────────────────────

/**
 * 将 class 变更应用到原始 HTML 文本
 * 在 class="..." 属性中将 from class 替换为 to class
 * @param {string} html - 原始 HTML 文本
 * @param {Array<{from: string, to: string}>} changes - 变更列表
 * @returns {string} 修改后的 HTML
 */
function applyChangesToHtml(html, changes) {
  let result = html;
  for (const { from, to } of changes) {
    // 在 class="..." 属性中将 from class 替换为 to class
    // 使用单词边界确保精确匹配整个 class 名
    const escapedFrom = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(class\\s*=\\s*["'])([^"']*)(["'])`, 'g');
    result = result.replace(re, (match, prefix, classValue, suffix) => {
      // 检查 class 值中是否包含目标 class（作为独立的单词）
      if (!classValue.split(/\s+/).includes(from)) return match;
      // 替换：将 class 列表中的 from 替换为 to
      const parts = classValue.split(/(\s+)/);
      const newParts = parts.map(p => p === from ? to : p);
      return `${prefix}${newParts.join('')}${suffix}`;
    });
  }
  return result;
}

// ─── 单文件修复循环 ──────────────────────────────────────────

/**
 * 修复单个 HTML 文件的溢出
 * @param {import('playwright').Page} page
 * @param {string} htmlPath - HTML 文件路径
 * @param {number} timeoutSec - 超时秒数
 * @returns {{ fixed: boolean, steps: number, remainingOverflows: number }}
 */
async function fixFile(page, htmlPath, timeoutSec) {
  const startTime = Date.now();
  const timeoutMs = timeoutSec * 1000;
  const maxDepth = 10;

  // 保存原始 HTML 文本，用于后续文本替换（避免 page.content() 引入渲染产物）
  let originalHtml = fs.readFileSync(htmlPath, 'utf-8');
  // 收集所有 class 变更记录
  const allChanges = [];

  // 首次检测
  let overflows = await detectOverflow(page, htmlPath, thresholdPercent, thresholdPx);

  if (overflows.length === 0) {
    log('  ✅ 无溢出，跳过');
    return { fixed: true, steps: 0, remainingOverflows: 0 };
  }

  log(`  🔍 检测到 ${overflows.length} 处溢出`);

  // 生成策略步骤
  const strategySteps = generateStrategySteps(maxDepth);
  let totalSteps = 0;

  for (const step of strategySteps) {
    // 超时检查
    if (Date.now() - startTime > timeoutMs) {
      log(`  ⏱️ 超时 (${timeoutSec}s)，停止修复`);
      break;
    }

    let stepLabel;
    if (step.depth === 0) {
      stepLabel = `降级溢出元素 ${step.typeLabel}`;
    } else if (step.depth === 'typo') {
      stepLabel = `降级溢出元素 ${step.typeLabel}`;
    } else if (step.depth < 0) {
      stepLabel = `降级第 ${-step.depth} 级父元素 ${step.typeLabel}`;
    } else {
      stepLabel = `降级第 ${step.depth} 级子元素 ${step.typeLabel}`;
    }

    // 排版降级步骤（font-size / line-height）
    if (step.depth === 'typo') {
      const typoDef = TYPO_TYPES[step.typeName];
      const typoResult = await processTypographyStep(page, step.typeName, typoDef);

      if (typoResult.length === 0) continue;

      totalSteps++;
      log(`\n  ▶ 步骤 ${totalSteps}: ${stepLabel}`);
      for (const change of typoResult) {
        log(`    ${change.from} → ${change.to}`);
      }
      allChanges.push(...typoResult);

      // 清除旧标签，重新检测
      await page.evaluate(() => {
        document.querySelectorAll('.y_axis_overflow_detected').forEach(el => {
          el.classList.remove('y_axis_overflow_detected');
        });
      });
      await page.waitForTimeout(500);

      const recheckResults = await page.evaluate(({ pct, px }) => {
        const results = [];
        const TAG = 'y_axis_overflow_detected';
        const slides = document.querySelectorAll('.ppt-slide');
        if (slides.length === 0) return results;
        for (const slide of slides) {
          const elements = slide.querySelectorAll('*');
          for (const el of elements) {
            const sH = el.scrollHeight;
            const cH = el.clientHeight;
            const overflow = sH - cH;
            if (overflow <= 0) continue;
            const ratio = overflow / cH;
            if (ratio * 100 > pct && overflow > px) {
              el.classList.add(TAG);
              results.push({
                scrollHeight: sH,
                clientHeight: cH,
                overflow: Math.round(overflow * 10) / 10,
              });
            }
          }
        }
        return results;
      }, { pct: thresholdPercent, px: thresholdPx });

      overflows = recheckResults;

      if (overflows.length === 0) {
        log('  ✅ 重新检测: 无溢出');
        if (!dryRun) {
          // 使用文本替换而非 page.content()，避免引入渲染产物（如 ECharts 动态生成的 SVG）
          originalHtml = applyChangesToHtml(originalHtml, allChanges);
          fs.writeFileSync(htmlPath, originalHtml, 'utf-8');
        }
        return { fixed: true, steps: totalSteps, remainingOverflows: 0 };
      }

      warn(`  ⚠️  重新检测: 仍有 ${overflows.length} 处溢出`);
      continue;
    }

    // 将正则字符串转为数组传给浏览器
    const typeDef = SPACING_TYPES[step.typeName];
    const patternStrings = typeDef.patterns;
    const arbitraryPatternStrings = typeDef.arbitraryPatterns;

    const result = await page.evaluate(({ depth, patternStrs, arbitraryPatternStrs }) => {
      // 在浏览器内重建正则
      const patterns = patternStrs.map(s => new RegExp(s));
      const arbitraryPatterns = arbitraryPatternStrs.map(s => new RegExp(s));

      const changes = [];
      const overflowEls = document.querySelectorAll('.y_axis_overflow_detected');

      for (const overflowEl of overflowEls) {
        let targetEls;
        if (depth === 0) {
          targetEls = [overflowEl];
        } else if (depth < 0) {
          // 父元素遍历：向上收集第 |depth| 级祖先
          targetEls = [];
          let current = overflowEl.parentElement;
          let parentLevel = 1;
          const slides = document.querySelectorAll('.ppt-slide');
          const slideSet = new Set(slides);
          while (current) {
            // 不超过 .ppt-slide 边界
            if (slideSet.has(current)) break;
            if (parentLevel === -depth) {
              targetEls.push(current);
              break;
            }
            current = current.parentElement;
            parentLevel++;
          }
        } else {
          // 子元素遍历：向下收集第 depth 级子元素
          targetEls = [];
          const collectAtDepth = (el, currentDepth) => {
            if (currentDepth === depth) {
              targetEls.push(el);
              return;
            }
            for (const child of el.children) {
              collectAtDepth(child, currentDepth + 1);
            }
          };
          for (const child of overflowEl.children) {
            collectAtDepth(child, 1);
          }
        }

        for (const el of targetEls) {
          const classList = Array.from(el.classList);

          // 处理标准数字类
          for (const pattern of patterns) {
            for (const cls of classList) {
              const m = cls.match(pattern);
              if (!m) continue;
              const value = parseInt(m[1], 10);
              if (value < 2) continue;
              const prefix = cls.replace(/-\d+$/, '');
              const newClass = `${prefix}-1`;
              el.classList.remove(cls);
              el.classList.add(newClass);
              changes.push({ from: cls, to: newClass });
            }
          }

          // 处理任意值类
          for (const pattern of arbitraryPatterns) {
            for (const cls of classList) {
              const m = cls.match(pattern);
              if (!m) continue;
              const valStr = m[1];
              const numMatch = valStr.match(/^(-?\d+(?:\.\d+)?)\s*(px|rem|em)?$/);
              if (!numMatch) continue;
              const num = parseFloat(numMatch[1]);
              const unit = numMatch[2] || 'px';
              let pxValue = num;
              if (unit === 'rem' || unit === 'em') pxValue = num * 16;
              if (pxValue < 4) continue;
              const prefix = cls.replace(/-\[([^\]]+)\]$/, '');
              const newClass = `${prefix}-1`;
              el.classList.remove(cls);
              el.classList.add(newClass);
              changes.push({ from: cls, to: newClass });
            }
          }
        }
      }

      return changes;
    }, {
      depth: step.depth,
      patternStrs: patternStrings,
      arbitraryPatternStrs: arbitraryPatternStrings,
    });

    if (result.length === 0) continue; // 这一步没有可降级的类，跳过

    totalSteps++;
    log(`\n  ▶ 步骤 ${totalSteps}: ${stepLabel}`);
    for (const change of result) {
      log(`    ${change.from} → ${change.to}`);
    }
    allChanges.push(...result);

    // 清除旧标签，重新检测
    await page.evaluate(() => {
      document.querySelectorAll('.y_axis_overflow_detected').forEach(el => {
        el.classList.remove('y_axis_overflow_detected');
      });
    });

    // 等待 Tailwind JIT 编译完成新生成的样式
    await page.waitForTimeout(500);

    // 在当前页面重新检测（不重新加载）
    const recheckResults = await page.evaluate(({ pct, px }) => {
      const results = [];
      const TAG = 'y_axis_overflow_detected';
      const slides = document.querySelectorAll('.ppt-slide');
      if (slides.length === 0) return results;

      for (const slide of slides) {
        const elements = slide.querySelectorAll('*');
        for (const el of elements) {
          const sH = el.scrollHeight;
          const cH = el.clientHeight;
          const overflow = sH - cH;
          if (overflow <= 0) continue;
          const ratio = overflow / cH;
          if (ratio * 100 > pct && overflow > px) {
            el.classList.add(TAG);
            results.push({
              scrollHeight: sH,
              clientHeight: cH,
              overflow: Math.round(overflow * 10) / 10,
            });
          }
        }
      }
      return results;
    }, { pct: thresholdPercent, px: thresholdPx });

    overflows = recheckResults;

    if (overflows.length === 0) {
      log('  ✅ 重新检测: 无溢出');
      if (!dryRun) {
        // 使用文本替换而非 page.content()，避免引入渲染产物（如 ECharts 动态生成的 SVG）
        originalHtml = applyChangesToHtml(originalHtml, allChanges);
        fs.writeFileSync(htmlPath, originalHtml, 'utf-8');
      }
      return { fixed: true, steps: totalSteps, remainingOverflows: 0 };
    }

    warn(`  ⚠️  重新检测: 仍有 ${overflows.length} 处溢出`);
  }

  // 策略耗尽，写回已做的修改
  if (!dryRun && totalSteps > 0) {
    // 使用文本替换而非 page.content()，避免引入渲染产物（如 ECharts 动态生成的 SVG）
    originalHtml = applyChangesToHtml(originalHtml, allChanges);
    fs.writeFileSync(htmlPath, originalHtml, 'utf-8');
  }

  return { fixed: false, steps: totalSteps, remainingOverflows: overflows.length };
}

// ─── 主流程 ──────────────────────────────────────────────────

async function main() {
  const files = collectFiles(targetPath);
  if (files.length === 0) {
    warn('未找到 HTML 文件');
    process.exit(0);
  }

  log('🔧 纵向溢出自动修复');
  log(`📁 目标: ${targetPath} (${files.length} 个文件)`);
  log(`⏱️ 超时: ${timeout}s`);
  if (dryRun) log('🏃 试运行模式（不写入文件）');
  log('='.repeat(50));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 720 });

  let totalFiles = 0;
  let fixedFiles = 0;
  let unfixableFiles = 0;
  let totalSteps = 0;

  for (const file of files) {
    const fileName = path.basename(file);
    totalFiles++;
    log(`\n📄 ${fileName}`);

    try {
      const result = await fixFile(page, file, timeout);

      if (result.fixed) {
        fixedFiles++;
        if (result.steps > 0) {
          log(`\n  🎉 ${fileName} — 修复成功 (${result.steps} 步)`);
        }
      } else {
        unfixableFiles++;
        warn(`\n  ⚠️  ${fileName} — 未能完全修复 (剩余 ${result.remainingOverflows} 处溢出)`);
      }
      totalSteps += result.steps;
    } catch (err) {
      unfixableFiles++;
      warn(`\n  ⚠️  ${fileName} — 修复失败: ${err.message}`);
    }
  }

  await browser.close();

  // 统计
  log('\n' + '='.repeat(50));
  log('📊 统计：');
  log(`   检查文件：${totalFiles}`);
  log(`   修复成功：${fixedFiles}`);
  log(`   未能修复：${unfixableFiles}`);
  log(`   总步骤：${totalSteps}`);

  if (unfixableFiles > 0) {
    process.exit(0);
  }

  log('\n✨ 所有文件溢出已修复！');
}

main().catch(err => {
  error('致命错误:', err);
  process.exit(2);
});
