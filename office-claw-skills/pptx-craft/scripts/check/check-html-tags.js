#!/usr/bin/env node
/**
 * HTML 标签闭合检测脚本（通用版）
 *
 * 功能：
 * 1. 扫描指定目录下的所有 .html 文件
 * 2. 检测 HTML 标签闭合问题（通用检测，不局限于特定标签）
 * 3. 输出检测报告（不修复）
 *
 * 用法：
 * node check-html-tags.js <html 目录>
 * node check-html-tags.js ./output/pages/
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log, warn, error, configureFromArgs } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 获取命令行参数
const args = process.argv.slice(2);
configureFromArgs(args);
if (args.length === 0) {
  error('用法：node check-html-tags.js <html 目录>');
  error('示例：node check-html-tags.js ./output/pages/');
  process.exit(1);
}

const targetDir = args[0];

if (!fs.existsSync(targetDir)) {
  error(`错误：目录不存在 - ${targetDir}`);
  process.exit(1);
}

// 自闭合标签列表（不需要闭合标签的 HTML 元素）
const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

/**
 * 检测 HTML 文件中的标签闭合问题
 */
function checkHtmlTags(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const issues = [];

  // 提取所有标签（包括开标签和闭标签）
  const tagRegex = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)\s*>/g;
  const tagStack = []; // 用于跟踪未闭合的标签
  const tagMap = new Map(); // 统计每种标签的开闭数量

  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2].toLowerCase();
    const selfClosing = match[4] === '/';

    // 跳过自闭合标签
    if (VOID_ELEMENTS.has(tagName) || selfClosing) {
      continue;
    }

    if (!tagMap.has(tagName)) {
      tagMap.set(tagName, { open: 0, close: 0 });
    }

    if (isClosing) {
      tagMap.get(tagName).close++;

      // 检查闭合标签是否与最近的开标签匹配
      const lastOpenTag = tagStack[tagStack.length - 1];
      if (lastOpenTag && lastOpenTag.tagName === tagName) {
        tagStack.pop();
      } else if (lastOpenTag) {
        // 标签嵌套顺序错误
        const idx = match.index;
        const lines = content.substring(0, idx).split('\n');
        const lineNum = lines.length;
        issues.push({
          type: 'nested-order-error',
          description: `标签嵌套顺序错误：在 <${lastOpenTag.tagName}> 未闭合的情况下闭合了 </${tagName}>`,
          line: lineNum,
          severity: 'error'
        });
      }
    } else {
      tagMap.get(tagName).open++;
      tagStack.push({ tagName, index: match.index });
    }
  }

  // 检查未闭合的标签
  if (tagStack.length > 0) {
    const unclosedTags = tagStack.map(t => t.tagName);
    const firstUnclosed = tagStack[0];
    const lines = content.substring(0, firstUnclosed.index).split('\n');
    const lineNum = lines.length;
    issues.push({
      type: 'unclosed-tags',
      description: `发现未闭合的标签：${unclosedTags.join(', ')}`,
      line: lineNum,
      severity: 'error'
    });
  }

  // 检查标签数量不平衡
  for (const [tagName, counts] of tagMap.entries()) {
    if (counts.open !== counts.close) {
      issues.push({
        type: 'unbalanced-tags',
        tag: `<${tagName}>`,
        openCount: counts.open,
        closeCount: counts.close,
        severity: 'error'
      });
    }
  }

  return issues;
}

/**
 * 扫描目录并检测所有 HTML 文件
 */
function scanAndCheck(directory) {
  const files = fs.readdirSync(directory);
  const report = {
    scanned: 0,
    filesWithIssues: 0,
    totalIssues: 0,
    errors: 0,
    warnings: 0,
    details: []
  };

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // 递归处理子目录
      const subReport = scanAndCheck(filePath);
      report.scanned += subReport.scanned;
      report.filesWithIssues += subReport.filesWithIssues;
      report.totalIssues += subReport.totalIssues;
      report.errors += subReport.errors;
      report.warnings += subReport.warnings;
      report.details.push(...subReport.details);
      continue;
    }

    if (file.endsWith('.html') || file.endsWith('.htm')) {
      report.scanned++;

      try {
        const issues = checkHtmlTags(filePath);
        if (issues.length > 0) {
          report.filesWithIssues++;
          report.totalIssues += issues.length;
          report.details.push({
            file: filePath,
            issues: issues
          });

          const fileErrors = issues.filter(i => i.severity === 'error').length;
          const fileWarnings = issues.filter(i => i.severity === 'warning').length;
          report.errors += fileErrors;
          report.warnings += fileWarnings;

          log(`❌ 发现问题：${filePath}`);
          issues.forEach(issue => {
            const icon = issue.severity === 'error' ? '  ❌' : '  ⚠️';
            log(`${icon} [${issue.severity.toUpperCase()}] ${formatIssue(issue)}`);
          });
        } else {
          log(`✓ 无问题：${filePath}`);
        }
      } catch (error) {
        warn(`❌ 处理失败：${filePath} - ${error.message}`);
      }
    }
  }

  return report;
}

/**
 * 格式化问题描述
 */
function formatIssue(issue) {
  switch (issue.type) {
    case 'wrong-closing-tag':
      return `第 ${issue.line} 行：${issue.description}`;
    case 'wrong-closing-tag-inside-script':
      return `第 ${issue.line} 行：<script> 块内出现了 ${issue.found}，应为 ${issue.expected}`;
    case 'unbalanced-tags':
      return `${issue.tag} 标签不平衡：打开 ${issue.openCount} 个，闭合 ${issue.closeCount} 个`;
    case 'unclosed-tags':
      return `第 ${issue.line} 行：${issue.description}`;
    case 'nested-order-error':
      return `第 ${issue.line} 行：${issue.description}`;
    case 'duplicate-closing-tags':
      return `第 ${issue.line} 行：${issue.description}`;
    default:
      return JSON.stringify(issue);
  }
}

// 执行扫描和检测
log(`🔍 开始扫描目录：${targetDir}`);
log('='.repeat(60));

const report = scanAndCheck(targetDir);

log('='.repeat(60));
log('📊 检测报告：');
log(`   扫描文件数：${report.scanned}`);
log(`   有问题的文件：${report.filesWithIssues}`);
log(`   问题总数：${report.totalIssues}`);
log(`   - 错误：${report.errors}`);
log(`   - 警告：${report.warnings}`);

if (report.details.length > 0) {
  log('\n📝 详细问题：');
  report.details.forEach(detail => {
    log(`\n   文件：${detail.file}`);
    detail.issues.forEach(issue => {
      const icon = issue.severity === 'error' ? '❌' : '⚠️';
      log(`   ${icon} [${issue.severity.toUpperCase()}] ${formatIssue(issue)}`);
    });
  });
}

// 如果有错误，返回零退出码（检测到问题不是脚本运行错误）
if (report.errors > 0) {
  warn('\n⚠️  发现严重错误，请修复后重新检查');
  process.exit(0);
}

log('\n✨ 完成！');
