#!/usr/bin/env node
/**
 * HTML 布局属性检查/修复脚本
 *
 * 功能：
 * 1. 检查 Grid/Flex 布局的 CSS 类属性是否正确
 * 2. 自动修复可修复的问题（--fix 模式）
 * 3. 报告结构问题（需人工处理）
 *
 * 用法：
 * node check-layout-props.js <文件或目录>
 * node check-layout-props.js <文件或目录> --fix
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 解析命令行参数
const args = process.argv.slice(2);
const fixMode = args.includes('--fix');
const targets = args.filter(a => !a.startsWith('--'));

if (targets.length === 0) {
  console.error('用法：node check-layout-props.js <文件或目录> [--fix]');
  console.error('示例：node check-layout-props.js ./output/pages/');
  console.error('      node check-layout-props.js ./output/pages/ --fix');
  process.exit(1);
}

// ─── HTML 解析 ──────────────────────────────────────────────

/**
 * 解析属性字符串为对象
 */
function parseAttrs(attrStr) {
  const attrs = {};
  const re = /(\w[\w-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return attrs;
}

/**
 * 基于位置重建标签树
 * 返回数组：{ tag, attrs, selfIndex, parentIndex, classStr, pos }
 */
function rebuildTagTree(html) {
  const voidElements = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
  const result = [];
  const stack = []; // { tag, index }

  const OPEN_RE = /<(\w+)((?:\s[^>]*)?)>/g;
  const CLOSE_RE = /<\/(\w+)>/g;

  const events = [];
  let m;

  OPEN_RE.lastIndex = 0;
  while ((m = OPEN_RE.exec(html)) !== null) {
    const tag = m[1].toLowerCase();
    if (tag === 'script' || tag === 'style') {
      // 跳过并跳过内容
      if (tag === 'script') {
        const endIdx = html.indexOf('</script>', m.index + m[0].length);
        if (endIdx !== -1) OPEN_RE.lastIndex = endIdx + 9;
      }
      if (tag === 'style') {
        const endIdx = html.indexOf('</style>', m.index + m[0].length);
        if (endIdx !== -1) OPEN_RE.lastIndex = endIdx + 9;
      }
      continue;
    }
    events.push({ type: 'open', tag, pos: m.index, attrStr: m[2] || '' });
  }

  CLOSE_RE.lastIndex = 0;
  while ((m = CLOSE_RE.exec(html)) !== null) {
    events.push({ type: 'close', tag: m[1].toLowerCase(), pos: m.index });
  }

  // 按位置排序
  events.sort((a, b) => a.pos - b.pos);

  for (const evt of events) {
    if (evt.type === 'open') {
      const attrs = parseAttrs(evt.attrStr);
      const idx = result.length;
      const parentIdx = stack.length > 0 ? stack[stack.length - 1].index : -1;
      result.push({
        tag: evt.tag,
        attrs,
        selfIndex: idx,
        parentIndex: parentIdx,
        classStr: attrs.class || '',
        pos: evt.pos,
      });
      if (!voidElements.has(evt.tag)) {
        stack.push({ tag: evt.tag, index: idx });
      }
    } else {
      // 闭合标签：弹栈
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].tag === evt.tag) {
          stack.splice(i, 1);
          break;
        }
      }
    }
  }

  return result;
}

/**
 * 获取节点的直接子元素
 */
function getDirectChildren(tags, parentIdx) {
  return tags.filter(t => t.parentIndex === parentIdx);
}

/**
 * 判断节点是否有某个 class
 */
function hasClass(classStr, className) {
  return new RegExp(`(?:^|\\s)${className}(?:\\s|$)`).test(classStr);
}

/**
 * 向 class 字符串追加类名
 */
function addClasses(classStr, ...classes) {
  let result = classStr;
  for (const cls of classes) {
    if (!hasClass(result, cls)) {
      result = result ? `${result} ${cls}` : cls;
    }
  }
  return result;
}

// ─── 检查规则 ──────────────────────────────────────────────

/**
 * 检查 Grid 子元素是否有 min-h-0
 * 规则：grid-cols-* 父元素的子元素需有 h-full min-h-0
 */
function checkGridChildren(tags, issues) {
  // 找出所有 Grid 父容器
  const gridParents = tags.filter(t =>
    /\bgrid-cols-\d+\b/.test(t.classStr)
  );

  for (const parent of gridParents) {
    const children = getDirectChildren(tags, parent.selfIndex);
    for (const child of children) {
      const hasHFull = hasClass(child.classStr, 'h-full');
      const hasMinH0 = hasClass(child.classStr, 'min-h-0');

      // 如果有 h-full 但缺少 min-h-0
      if (hasHFull && !hasMinH0) {
        issues.push({
          type: 'grid-child-missing-min-h-0',
          node: child,
          severity: 'error',
          fixable: true,
          fix: { addClasses: ['min-h-0'] },
          message: `Grid 子元素 <${child.tag}> 有 h-full 但缺少 min-h-0`,
        });
      }
    }
  }
}

/**
 * 检查 main 子元素是否使用 h-full（应改为 flex-1）
 * 规则：main 的直接子元素禁止 h-full
 */
function checkMainChildren(tags, issues) {
  const mainNodes = tags.filter(t => t.tag === 'main');

  for (const main of mainNodes) {
    const children = getDirectChildren(tags, main.selfIndex);

    // 检查子元素数量
    if (children.length < 2) {
      issues.push({
        type: 'main-single-child',
        node: main,
        severity: 'error',
        fixable: false,
        message: `main 仅有 ${children.length} 个子元素，需至少 2 个`,
      });
    }

    // 检查子元素是否使用 h-full
    for (const child of children) {
      if (hasClass(child.classStr, 'h-full')) {
        // 检查是否已有 flex-1
        const hasFlex1 = hasClass(child.classStr, 'flex-1');
        if (!hasFlex1) {
          issues.push({
            type: 'main-child-h-full',
            node: child,
            severity: 'error',
            fixable: true,
            fix: { removeClass: 'h-full', addClasses: ['flex-1', 'min-h-0'] },
            message: `main 子元素 <${child.tag}> 使用 h-full，应改为 flex-1 min-h-0`,
          });
        }
      }
    }
  }
}

/**
 * 检查 header/footer 是否有 flex-shrink-0
 */
function checkHeaderFooter(tags, issues) {
  const hfNodes = tags.filter(t => t.tag === 'header' || t.tag === 'footer');

  for (const node of hfNodes) {
    const hasShrink0 = hasClass(node.classStr, 'flex-shrink-0');
    if (!hasShrink0) {
      issues.push({
        type: 'header-footer-missing-shrink',
        node: node,
        severity: 'warning',
        fixable: true,
        fix: { addClasses: ['flex-shrink-0'] },
        message: `<${node.tag}> 缺少 flex-shrink-0`,
      });
    }
  }
}

/**
 * 检查 main 是否有必要的 flex 类
 * 规则：main 需有 flex flex-col min-h-0 overflow-hidden
 */
function checkMainFlexClasses(tags, issues) {
  const mainNodes = tags.filter(t => t.tag === 'main');

  const requiredClasses = ['flex', 'flex-col', 'min-h-0', 'overflow-hidden'];

  for (const main of mainNodes) {
    const missing = requiredClasses.filter(cls => !hasClass(main.classStr, cls));
    if (missing.length > 0) {
      issues.push({
        type: 'main-missing-flex-classes',
        node: main,
        severity: 'error',
        fixable: true,
        fix: { addClasses: missing },
        message: `main 缺少必要的 flex 类: ${missing.join(', ')}`,
      });
    }
  }
}

/**
 * 检查 ppt-slide 是否有固定高度
 * 规则：.ppt-slide 需有 h-[720px] overflow-hidden
 */
function checkPptSlide(tags, issues) {
  const slideNodes = tags.filter(t => hasClass(t.classStr, 'ppt-slide'));

  for (const node of slideNodes) {
    const has720px = /\bh-\[720px\]\b/.test(node.classStr);
    const hasOverflow = hasClass(node.classStr, 'overflow-hidden');

    if (!has720px || !hasOverflow) {
      const missing = [];
      if (!has720px) missing.push('h-[720px]');
      if (!hasOverflow) missing.push('overflow-hidden');
      issues.push({
        type: 'ppt-slide-missing-height',
        node: node,
        severity: 'error',
        fixable: false,
        message: `.ppt-slide 缺少固定高度约束: ${missing.join(', ')}`,
      });
    }
  }
}

/**
 * 检查是否使用了禁止的 overflow-auto 类
 * 规则：禁止使用 overflow-auto / overflow-y-auto / overflow-x-auto
 */
function checkOverflowAuto(tags, issues) {
  const forbiddenClasses = ['overflow-auto', 'overflow-y-auto', 'overflow-x-auto'];

  for (const node of tags) {
    for (const forbidden of forbiddenClasses) {
      if (hasClass(node.classStr, forbidden)) {
        issues.push({
          type: 'overflow-auto-forbidden',
          node: node,
          severity: 'error',
          fixable: true,
          fix: {
            removeClass: forbidden,
            addClasses: [forbidden.replace('-auto', '-hidden')],
          },
          message: `<${node.tag}> 使用了禁止的 ${forbidden}，应改为 ${forbidden.replace('-auto', '-hidden')}`,
        });
      }
    }
  }
}

/**
 * 执行所有检查
 */
function runAllChecks(tags) {
  const issues = [];
  checkGridChildren(tags, issues);
  checkMainChildren(tags, issues);
  checkHeaderFooter(tags, issues);
  checkMainFlexClasses(tags, issues);
  checkOverflowAuto(tags, issues);
  checkPptSlide(tags, issues);
  return issues;
}

// ─── 修复功能 ──────────────────────────────────────────────

/**
 * 转义正则特殊字符
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 在 HTML 内容中修改标签的 class 属性
 */
function patchClassAttr(html, node, fix) {
  let newClassStr = node.classStr;

  // 移除指定的 class
  if (fix.removeClass) {
    newClassStr = newClassStr.replace(
      new RegExp(`(?:^|\\s)${escapeRegExp(fix.removeClass)}(?:\\s|$)`),
      ' '
    ).trim();
  }

  // 添加新的 class
  if (fix.addClasses && fix.addClasses.length > 0) {
    newClassStr = addClasses(newClassStr, ...fix.addClasses);
  }

  // 在 HTML 中找到这个标签并替换 class
  if (node.attrs.id) {
    // 用 id 精确定位
    // class 可能在 id 之前或之后
    const patterns = [
      // class 在 id 之后
      new RegExp(
        `(<${node.tag}\\s[^>]*id\\s*=\\s*["']${escapeRegExp(node.attrs.id)}["'][^>]*class\\s*=\\s*["'])(${escapeRegExp(node.classStr)})(["'][^>]*>)`,
        's'
      ),
      // class 在 id 之前
      new RegExp(
        `(<${node.tag}\\s[^>]*class\\s*=\\s*["'])(${escapeRegExp(node.classStr)})(["'][^>]*id\\s*=\\s*["']${escapeRegExp(node.attrs.id)}["'][^>]*>)`,
        's'
      ),
    ];

    for (const re of patterns) {
      const match = html.match(re);
      if (match) {
        return html.replace(re, `$1${newClassStr}$3`);
      }
    }
  }

  // 无 id：基于 class 精确匹配
  const re = new RegExp(
    `(<${node.tag}\\s[^>]*class\\s*=\\s*["'])(${escapeRegExp(node.classStr)})(["'][^>]*>)`,
    's'
  );
  const match = html.match(re);
  if (match) {
    return html.replace(re, `$1${newClassStr}$3`);
  }

  console.warn(`    ⚠️  无法在 HTML 中定位 <${node.tag}> class="${node.classStr}"`);
  return html;
}

/**
 * 应用修复到 HTML 内容
 */
function applyFixes(html, issues) {
  let newHtml = html;
  const fixableIssues = issues.filter(i => i.fixable && i.fix);
  const fixedCount = { success: 0, failed: 0 };

  for (const issue of fixableIssues) {
    const newHtmlTry = patchClassAttr(newHtml, issue.node, issue.fix);

    if (newHtmlTry !== newHtml) {
      newHtml = newHtmlTry;
      fixedCount.success++;
      const action = issue.fix.removeClass
        ? `移除 ${issue.fix.removeClass}，添加 ${issue.fix.addClasses.join(' ')}`
        : `添加 ${issue.fix.addClasses.join(' ')}`;
      console.log(`  ✅ [FIXED] ${issue.message} → ${action}`);
    } else {
      fixedCount.failed++;
      console.log(`  ⚠️  [FAILED] ${issue.message} - 无法定位元素`);
    }
  }

  return { html: newHtml, fixedCount };
}

/**
 * 从 class 字符串移除指定类名
 */
function removeClass(classStr, className) {
  return classStr.replace(
    new RegExp(`(?:^|\\s)${escapeRegExp(className)}(?:\\s|$)`),
    ' '
  ).replace(/\s+/g, ' ').trim();
}

// ─── 主流程 ──────────────────────────────────────────────

/**
 * 检查/修复单个 HTML 文件
 */
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  console.log(`\n🔍 检查：${fileName}`);

  // 解析标签树
  const tags = rebuildTagTree(content);

  // 执行检查
  const issues = runAllChecks(tags);

  if (issues.length === 0) {
    console.log(`  ✅ 无问题`);
    return { errors: 0, warnings: 0, fixed: 0, needManual: 0 };
  }

  // 分类统计
  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');
  const fixable = issues.filter(i => i.fixable);
  const needManual = issues.filter(i => !i.fixable);

  // 报告所有问题
  for (const issue of issues) {
    const icon = issue.severity === 'error' ? '❌' : '⚠️';
    const fixableTag = issue.fixable ? '[可修复]' : '[需人工]';
    console.log(`  ${icon} ${fixableTag} ${issue.message}`);
  }

  let fixedCount = 0;

  // 修复模式：应用修复
  if (fixMode && fixable.length > 0) {
    console.log(`\n  🔧 修复模式：`);
    const result = applyFixes(content, fixable);
    fixedCount = result.fixedCount.success;

    if (result.fixedCount.success > 0) {
      fs.writeFileSync(filePath, result.html, 'utf-8');
      console.log(`  📝 已保存修复后的文件`);
    }
  }

  // 需人工处理的问题
  if (needManual.length > 0) {
    console.log(`\n  ⚠️  需人工处理的问题：`);
    for (const issue of needManual) {
      console.log(`    - ${issue.message}`);
    }
  }

  return {
    errors: errors.length,
    warnings: warnings.length,
    fixed: fixedCount,
    needManual: needManual.length,
  };
}

/**
 * 处理文件或目录
 */
function processTarget(target) {
  if (!fs.existsSync(target)) {
    console.error(`错误：路径不存在 - ${target}`);
    return null;
  }

  const stat = fs.statSync(target);

  if (stat.isFile()) {
    if (!target.endsWith('.html') && !target.endsWith('.htm')) {
      console.error(`跳过非 HTML 文件：${target}`);
      return null;
    }
    return processFile(target);
  }

  if (stat.isDirectory()) {
    const files = fs.readdirSync(target).filter(f => f.endsWith('.html') || f.endsWith('.htm'));
    if (files.length === 0) {
      console.log('未找到 HTML 文件');
      return null;
    }

    let total = { errors: 0, warnings: 0, fixed: 0, needManual: 0 };
    for (const file of files) {
      const result = processFile(path.join(target, file));
      if (result) {
        total.errors += result.errors;
        total.warnings += result.warnings;
        total.fixed += result.fixed;
        total.needManual += result.needManual;
      }
    }
    return total;
  }

  console.error(`无效路径：${target}`);
  return null;
}

// ─── 入口 ──────────────────────────────────────────────

if (fixMode) {
  console.log('🔧 布局属性检查与修复');
} else {
  console.log('🔍 布局属性检查（仅报告）');
}

let totalResult = null;
for (const target of targets) {
  const result = processTarget(target);
  if (result) {
    if (!totalResult) totalResult = { errors: 0, warnings: 0, fixed: 0, needManual: 0 };
    totalResult.errors += result.errors;
    totalResult.warnings += result.warnings;
    totalResult.fixed += result.fixed;
    totalResult.needManual += result.needManual;
  }
}

// 输出统计
console.log('\n' + '='.repeat(60));
console.log('📊 统计：');
if (totalResult) {
  console.log(`   错误：${totalResult.errors}`);
  console.log(`   警告：${totalResult.warnings}`);
  if (fixMode) {
    console.log(`   已修复：${totalResult.fixed}`);
  }
  console.log(`   需人工：${totalResult.needManual}`);
} else {
  console.log('   未处理任何文件');
}

if (totalResult && totalResult.errors > 0 && !fixMode) {
  console.log('\n💡 提示：使用 --fix 参数自动修复可修复的问题');
  process.exit(1);
}

if (totalResult && totalResult.needManual > 0) {
  console.log('\n⚠️  存在需人工处理的问题，请检查后重新运行');
  process.exit(1);
}

console.log('\n✨ 完成！');
