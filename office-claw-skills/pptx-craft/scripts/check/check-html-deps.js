#!/usr/bin/env node
/**
 * HTML 本地依赖检测与自动补充脚本
 *
 * 功能：
 * 1. 扫描指定目录下的所有 .html 文件
 * 2. 检测 HTML 中使用了哪些依赖（FontAwesome、ECharts 等）
 * 3. 验证 <head> 中是否已引入对应的本地路径
 * 4. 自动补充缺失的依赖到 </head> 之前
 *
 * 用法：
 * node check-html-deps.js <html 目录>
 * node check-html-deps.js ./output/pages/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取命令行参数
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('用法：node check-html-deps.js <html 目录>');
  console.error('示例：node check-html-deps.js ./output/pages/');
  process.exit(1);
}

const targetDir = args[0];

if (!fs.existsSync(targetDir)) {
  console.error(`错误：目录不存在 - ${targetDir}`);
  process.exit(1);
}

/**
 * CDN 基础路径
 */
const CDN_BASE = 'https://cdn.digitalhumanai.top/slidagent/pptx-craft/assets';

/**
 * CDN 依赖注册表
 * 每个条目定义：使用检测模式、第三方 CDN URL 匹配（用于替换）、自建 CDN 路径检测、注入片段
 */
const DEPENDENCY_REGISTRY = [
  {
    id: 'tailwindcss',
    name: 'Tailwind CSS',
    usagePatterns: [/class="[^"]*(?:flex|grid|bg-|text-\[|p-\[|m-\[|w-\[|h-\[)/],
    // 匹配第三方 CDN <script> 标签，用于替换
    cdnUrlPattern: /<script[^>]*src=["']?https?:\/\/cdn\.tailwindcss\.com[^"']*["']?[^>]*>\s*<\/script>/gi,
    localPattern: new RegExp(escapeRegex(CDN_BASE + '/vendors/tailwind.js')),
    cdnSnippet: `    <script src="${CDN_BASE}/vendors/tailwind.js"></script>`,
    category: 'css',
  },
  {
    id: 'font-awesome',
    name: 'FontAwesome 图标',
    usagePatterns: [/fa-solid\b/, /fa-regular\b/, /fa-brands\b/, /\bfa fa-/],
    cdnUrlPattern: /<link[^>]*href=["']?https?:\/\/[^"']*(?:fontawesome-free|font-awesome)[^"']*["']?[^>]*\/?>/gi,
    localPattern: new RegExp(escapeRegex(CDN_BASE + '/vendors/fontawesome')),
    cdnSnippet: `    <link href="${CDN_BASE}/vendors/fontawesome/css/all.min.css" rel="stylesheet" />`,
    category: 'css',
  },
  {
    id: 'echarts',
    name: 'ECharts 图表库',
    usagePatterns: [/echarts\.init\(/, /echarts\.setOption\(/],
    cdnUrlPattern: /<script[^>]*src=["']?https?:\/\/[^"']*echarts[^"']*\.js["']?[^>]*>\s*<\/script>/gi,
    localPattern: new RegExp(escapeRegex(CDN_BASE + '/vendors/echarts')),
    cdnSnippet: `    <script src="${CDN_BASE}/vendors/echarts.min.js"></script>`,
    category: 'js',
  },
  {
    id: 'mathjax',
    name: 'MathJax 数学公式',
    usagePatterns: [/MathJax\./, /\\\\frac/, /\\\\sqrt/, /\\\\sum/],
    cdnUrlPattern: /<script[^>]*src=["']?https?:\/\/[^"']*mathjax[^"']*["']?[^>]*>\s*<\/script>/gi,
    localPattern: new RegExp(escapeRegex(CDN_BASE + '/vendors/mathjax')),
    cdnSnippet: `    <script src="${CDN_BASE}/vendors/mathjax/tex-svg.min.js"></script>`,
    category: 'js',
  },
];

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 检测内容中是否使用了某个依赖
 */
function detectUsage(content, patterns) {
  return patterns.some(pattern => pattern.test(content));
}

/**
 * 检测 <head> 中是否已包含本地路径
 */
function detectLocalPresent(headContent, localPattern) {
  return localPattern.test(headContent);
}

/**
 * 将 CDN URL 标签替换为本地路径
 */
function replaceCdnUrls(content, dep) {
  let newContent = content;
  let replaced = false;

  if (dep.cdnUrlPattern) {
    const matches = content.match(dep.cdnUrlPattern);
    if (matches && matches.length > 0) {
      newContent = content.replace(dep.cdnUrlPattern, dep.cdnSnippet);
      replaced = true;
    }
  }

  return { content: newContent, replaced };
}

/**
 * 处理单个 HTML 文件：检测缺失依赖并注入
 */
function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const result = {
    file: path.basename(filePath),
    used: [],
    present: [],
    replaced: [],
    missing: [],
    injected: [],
  };

  // 分割 <head> 和其余内容
  const headEndMatch = content.match(/<\/head>/i);
  if (!headEndMatch) {
    console.warn(`  ⚠️  跳过（未找到 </head> 标签）：${path.basename(filePath)}`);
    return result;
  }

  const headEndIndex = content.indexOf(headEndMatch[0]);
  const headContent = content.substring(0, headEndIndex);
  const bodyContent = content.substring(headEndIndex);

  // Step 1: 替换 CDN URL 为本地路径
  let contentChanged = false;
  for (const dep of DEPENDENCY_REGISTRY) {
    const { content: newContent, replaced } = replaceCdnUrls(content, dep);
    if (replaced) {
      content = newContent;
      contentChanged = true;
      result.replaced.push(dep.id);
    }
  }

  // Step 2: 重新分割 head/body（因为内容可能已变化）
  const headEndMatch2 = content.match(/<\/head>/i);
  if (!headEndMatch2) {
    console.warn(`  ⚠️  跳过（替换后未找到 </head> 标签）：${path.basename(filePath)}`);
    return result;
  }

  const headEndIndex2 = content.indexOf(headEndMatch2[0]);
  const currentHeadContent = content.substring(0, headEndIndex2);

  // Step 3: 检测缺失依赖并注入
  const missingDeps = [];
  for (const dep of DEPENDENCY_REGISTRY) {
    const isUsed = detectUsage(content, dep.usagePatterns);
    const isPresent = detectLocalPresent(currentHeadContent, dep.localPattern);

    if (isUsed) {
      result.used.push(dep.id);
      if (isPresent) {
        result.present.push(dep.id);
      } else {
        result.missing.push(dep.id);
        missingDeps.push(dep);
      }
    }
  }

  // Step 4: 注入缺失的依赖
  if (missingDeps.length > 0) {
    const lines = ['\n    <!-- CDN 依赖自动补充 (check-html-deps.js) -->'];
    for (const dep of missingDeps) {
      lines.push(`    <!-- ${dep.name} -->`);
      lines.push(dep.cdnSnippet);
      result.injected.push(dep.id);
    }
    lines.push('');

    const injectionBlock = lines.join('\n');
    content = content.replace(/<\/head>/i, injectionBlock + '  </head>');
  }

  // 写入文件（如果有改动）
  if (contentChanged || missingDeps.length > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  return result;
}

/**
 * 递归扫描目录并处理所有 HTML 文件
 */
function scanAndFix(directory) {
  const files = fs.readdirSync(directory);
  const report = {
    scanned: 0,
    filesFixed: 0,
    totalInjected: 0,
    depCounts: {},
    details: [],
  };

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // 递归处理子目录
      const subReport = scanAndFix(filePath);
      report.scanned += subReport.scanned;
      report.filesFixed += subReport.filesFixed;
      report.totalInjected += subReport.totalInjected;
      Object.entries(subReport.depCounts).forEach(([k, v]) => {
        report.depCounts[k] = (report.depCounts[k] || 0) + v;
      });
      report.details.push(...subReport.details);
      continue;
    }

    if (!file.endsWith('.html') && !file.endsWith('.htm')) {
      continue;
    }

    report.scanned++;

    try {
      const result = processFile(filePath);

      if (result.injected.length > 0) {
        report.filesFixed++;
        report.totalInjected += result.injected.length;
        result.injected.forEach(depId => {
          report.depCounts[depId] = (report.depCounts[depId] || 0) + 1;
        });
        console.log(`  🔧 已修复：${result.file}（补充 ${result.injected.length} 个依赖：${result.injected.join(', ')}）`);
      } else {
        console.log(`  ✓ 依赖完整：${result.file}`);
      }

      report.details.push(result);
    } catch (error) {
      console.error(`  ❌ 处理失败：${file} - ${error.message}`);
    }
  }

  return report;
}

// 执行扫描和修复
console.log(`🔍 开始依赖检测与 CDN 补充：${targetDir}`);
console.log('='.repeat(60));

const report = scanAndFix(targetDir);

console.log('='.repeat(60));
console.log('📊 检测报告：');
console.log(`   扫描文件数：${report.scanned}`);
console.log(`   已修复文件：${report.filesFixed}`);
console.log(`   注入依赖总数：${report.totalInjected}`);

if (Object.keys(report.depCounts).length > 0) {
  console.log('   依赖注入详情：');
  for (const [depId, count] of Object.entries(report.depCounts)) {
    const dep = DEPENDENCY_REGISTRY.find(d => d.id === depId);
    console.log(`     ${dep ? dep.name : depId}: ${count} 个文件`);
  }
}

console.log('\n✨ 完成！');
