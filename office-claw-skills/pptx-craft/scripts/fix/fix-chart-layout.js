#!/usr/bin/env node
/**
 * ECharts SVG 渲染器自动修复脚本
 *
 * 功能：
 * 检测并修复 echarts.init 调用，确保所有图表使用 SVG 渲染器。
 * 将 echarts.init(document.getElementById('xxx')[, null]) 补充为
 * echarts.init(document.getElementById('xxx'), null, { renderer: 'svg' })
 *
 * 用法：
 * node fix-chart-layout.js <文件或目录>
 * node fix-chart-layout.js ./output/pages/
 * node fix-chart-layout.js ./output/pages/page-1.pptx.html
 *
 * SKILL.md 强制要求（9a52fe）：
 * echarts.init 调用必须在一行内包含 { renderer: 'svg' }
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, warn, error, configureFromArgs } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── 正则：匹配 SKILL.md 强制要求的单行形式 ──────────────────
// echarts.init(document.getElementById('xxx'), null, { renderer: 'svg' })
const ECHART_INIT_RE = /echarts\.init\s*\(\s*document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:,\s*null\s*,\s*\{\s*renderer\s*:\s*['"]svg['"]\s*\}\s*)?\)/g;

// ─── 正则：检测缺少 SVG 渲染器的 echarts.init 调用 ──────────
// 匹配：echarts.init(document.getElementById('xxx')[, null])
// 不匹配：echarts.init(document.getElementById('xxx'), null, { renderer: 'svg' })
const ECHART_INIT_NO_RENDERER_RE = /echarts\.init\s*\(\s*document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:,\s*null)?\s*\)/g;

/**
 * 从 HTML 内容中提取所有已正确配置 SVG 渲染器的图表 ID
 */
function extractValidChartIds(html) {
  const ids = [];
  let match;
  ECHART_INIT_RE.lastIndex = 0;
  while ((match = ECHART_INIT_RE.exec(html)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/**
 * 检测并修复缺少 SVG 渲染器的 echarts.init 调用
 * 返回 { content, fixedCount, fixedIds } 或 { content, fixedCount: 0, fixedIds: [] }
 */
function patchRendererParam(html) {
  let newContent = html;
  let fixedCount = 0;
  const fixedIds = [];

  ECHART_INIT_NO_RENDERER_RE.lastIndex = 0;
  let match;
  while ((match = ECHART_INIT_NO_RENDERER_RE.exec(html)) !== null) {
    const id = match[1];
    const fullMatch = match[0];
    const fixedCall = `echarts.init(document.getElementById('${id}'), null, { renderer: 'svg' })`;

    if (fullMatch !== fixedCall) {
      newContent = newContent.replace(fullMatch, fixedCall);
      fixedIds.push(id);
      fixedCount++;
    }
  }

  return { content: newContent, fixedCount, fixedIds };
}

/**
 * 处理单个 HTML 文件
 */
function fixFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // 先提取已有的有效图表 ID（已正确配置 SVG 的）
  const validIds = extractValidChartIds(content);

  // 检测并修复缺少 SVG 渲染器的调用
  const result = patchRendererParam(content);

  if (result.fixedCount === 0) {
    if (validIds.length > 0) {
      log(`  ✓ ${fileName}：${validIds.length} 个图表已正确配置 SVG 渲染器`);
    } else {
      log(`  ✓ ${fileName}：无 ECharts 图表`);
    }
    return { fixed: false, chartCount: validIds.length };
  }

  // 写入修复后的内容
  fs.writeFileSync(filePath, result.content, 'utf-8');

  for (const id of result.fixedIds) {
    log(`  🔧 ${fileName}：#${id} → 补充 SVG 渲染器参数`);
  }

  return { fixed: true, chartCount: validIds.length + result.fixedCount, fixedIds: result.fixedIds };
}

/**
 * 处理文件或目录
 */
function processTarget(target) {
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    if (!target.endsWith('.html') && !target.endsWith('.htm')) {
      warn(`跳过非 HTML 文件：${target}`);
      return;
    }
    fixFile(target);
    return;
  }

  if (stat.isDirectory()) {
    const files = fs.readdirSync(target).filter(f => f.endsWith('.html') || f.endsWith('.htm'));
    if (files.length === 0) {
      warn('未找到 HTML 文件');
      return;
    }
    for (const file of files) {
      fixFile(path.join(target, file));
    }
    return;
  }

  error(`无效路径：${target}`);
}

// ─── 主流程 ──────────────────────────────────────────────
const args = process.argv.slice(2);

// 解析日志级别
configureFromArgs(args);

if (args.length === 0) {
  error('用法：node fix-chart-layout.js <文件或目录>');
  error('示例：node fix-chart-layout.js ./output/pages/');
  error('      node fix-chart-layout.js ./output/pages/page-1.html');
  process.exit(1);
}

log('🔧 ECharts SVG 渲染器自动修复\n');

const targets = args.filter(a => !a.startsWith('--'));

for (const target of targets) {
  if (!fs.existsSync(target)) {
    error(`错误：路径不存在 - ${target}`);
    continue;
  }
  processTarget(target);
}

log('\n✨ 完成！');
