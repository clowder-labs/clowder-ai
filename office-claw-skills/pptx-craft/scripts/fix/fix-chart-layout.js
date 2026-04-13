#!/usr/bin/env node
/**
 * ECharts 图表容器 Flex 链自动修复脚本
 *
 * 功能：
 * 1. 扫描 HTML 文件中的 ECharts 初始化代码，提取图表 DOM ID
 * 2. 找到对应的 DOM 元素，向上遍历到高度锚点祖先
 * 3. 补全路径上缺失的 flex/overflow 类，确保图表容器高度不为 0
 *
 * 用法：
 * node fix-chart-layout.js <文件或目录> [选项]
 * node fix-chart-layout.js ./output/pages/
 * node fix-chart-layout.js ./output/pages/page-1.pptx.html --dry-run
 *
 * 选项：
 *   --dry-run   仅输出诊断信息，不修改文件
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 解析命令行参数
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targets = args.filter(a => !a.startsWith('--'));

if (targets.length === 0) {
  console.error('用法：node fix-chart-layout.js <文件或目录> [--dry-run]');
  console.error('示例：node fix-chart-layout.js ./output/pages/');
  console.error('      node fix-chart-layout.js ./output/pages/page-1.html --dry-run');
  process.exit(1);
}

// ─── 正则：提取 ECharts 图表 ID ───────────────────────────────
// 匹配 SKILL.md 强制要求的单行形式：echarts.init(document.getElementById('xxx'), null, { renderer: 'svg' })
const ECHART_INIT_RE = /echarts\.init\s*\(\s*document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:,\s*null\s*,\s*\{\s*renderer\s*:\s*['"]svg['"]\s*\}\s*)?\)/g;

// ─── 正则：检测 echarts.init 是否缺少 SVG 渲染器 ───────────────
// 匹配缺少 renderer 参数的初始化：echarts.init(document.getElementById('xxx')[, null])
const ECHART_INIT_NO_RENDERER_RE = /echarts\.init\s*\(\s*document\.getElementById\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:,\s*null)?\s*\)/g;

// Tailwind 固定高度类模式
const FIXED_HEIGHT_RE = /(?:^|\s)(?:h-\[\d+[a-z]*\]|h-\d+|h-px|h-screen|h-full|h-svh|h-dvh|h-lvh|h-min|h-fit|h-auto)(?:\s|$)/;

// 页面根容器选择器
const ROOT_CONTAINERS = new Set(['html', 'body']);
const ROOT_CLASSES = ['content-safe', 'ppt-slide'];

/**
 * 从 HTML 内容中提取所有 ECharts 图表 ID
 */
function extractChartIds(html) {
  const ids = [];
  let match;
  // 防止 lastIndex 残留
  ECHART_INIT_RE.lastIndex = 0;
  while ((match = ECHART_INIT_RE.exec(html)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

/**
 * 检测并修复缺少 SVG 渲染器的 echarts.init 调用
 * 将 echarts.init(document.getElementById('xxx')[, null]) 补充为
 * echarts.init(document.getElementById('xxx'), null, { renderer: 'svg' })
 * 返回 { content, fixed } 或 null（无改动）
 */
function patchRendererParam(html) {
  let newContent = html;
  let hasFix = false;

  ECHART_INIT_NO_RENDERER_RE.lastIndex = 0;
  let match;
  while ((match = ECHART_INIT_NO_RENDERER_RE.exec(html)) !== null) {
    const chartId = match[1];
    const fullMatch = match[0];
    const id = match[1];

    // 构建修复后的字符串
    // 匹配模式：echarts.init(document.getElementById('id')[, null])
    // 替换为：echarts.init(document.getElementById('id'), null, { renderer: 'svg' })
    const fixedCall = `echarts.init(document.getElementById('${id}'), null, { renderer: 'svg' })`;

    if (fullMatch !== fixedCall) {
      console.log(`  🔧 renderer: #${id} → 补充 SVG 渲染器参数`);
      newContent = newContent.replace(fullMatch, fixedCall);
      hasFix = true;
    }
  }

  return hasFix ? { content: newContent, fixed: true } : null;
}

/**
 * 用简易 HTML 解析提取所有开始标签及其位置
 * 返回数组，每个元素：{ tag, attrs: { id?, class? }, selfIndex, parentIndex }
 */
function parseTagTree(html) {
  // 匹配所有开始标签（不含自闭合的 void 元素）
  const TAG_RE = /<(\w+)(\s[^>]*)?>/g;
  const tags = []; // { tag, attrs, parentIndex }
  const stack = []; // 栈，存 tags 数组索引

  let match;
  TAG_RE.lastIndex = 0;
  while ((match = TAG_RE.exec(html)) !== null) {
    const tagName = match[1].toLowerCase();
    // 跳过闭合标签、注释、doctype 等
    if (tagName === 'script' || tagName === 'style' || tagName === 'link' || tagName === 'meta') {
      // 跳过 head 中的标签，不参与 DOM 树
      // 但 script 需要特殊处理：跳过其内容
      if (tagName === 'script') {
        // 找到 </script>
        const endIdx = html.indexOf('</script>', match.index + match[0].length);
        if (endIdx !== -1) {
          TAG_RE.lastIndex = endIdx + 9;
        }
      }
      continue;
    }

    const attrStr = match[2] || '';
    const attrs = parseAttrs(attrStr);
    const selfIndex = tags.length;
    const parentIndex = stack.length > 0 ? stack[stack.length - 1] : -1;

    tags.push({ tag: tagName, attrs, selfIndex, parentIndex, classStr: attrs.class || '' });

    // void 元素不入栈
    const voidElements = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
    if (!voidElements.has(tagName)) {
      stack.push(selfIndex);
    }

    // 检测闭合标签并弹栈（简易方式：遇到同级或更高级的闭合标签时弹栈）
    // 这个简易解析器不做精确闭合匹配，改用基于缩进深度的方案
  }

  // 重新构建父子关系：用位置深度来推断
  // 更可靠的方案：用正则找闭合标签来维护栈
  return rebuildTagTree(html, tags);
}

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
 * 通过扫描开始标签和闭合标签来维护栈
 */
function rebuildTagTree(html, tags) {
  const voidElements = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr']);
  const result = [];
  const stack = []; // { tag, index }

  // 重新扫描，用精确的栈来建立父子关系
  const OPEN_RE = /<(\w+)((?:\s[^>]*)?)>/g;
  const CLOSE_RE = /<\/(\w+)>/g;

  // 合并所有标签位置
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
      // 闭合标签：弹栈，匹配最近的同名标签
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
 * 判断一个标签节点是否是高度锚点
 * 锚点 = 有明确固定高度的元素，或已经有正确的 flex-col 布局（其子元素的 flex-1 能生效）
 */
function isHeightAnchor(node) {
  const cls = node.classStr;

  // 页面根元素
  if (ROOT_CONTAINERS.has(node.tag)) return true;
  // 根容器类
  for (const rc of ROOT_CLASSES) {
    if (cls.split(/\s+/).includes(rc)) return true;
  }
  // 有固定高度类
  if (FIXED_HEIGHT_RE.test(cls)) return true;
  // 有 style 中的 height
  const style = node.attrs.style || '';
  if (/height\s*:/.test(style)) return true;

  return false;
}

/**
 * 获取从图表元素到高度锚点的路径
 * 返回路径上的所有节点（包含图表元素，不包含锚点）
 */
function getPathToAnchor(tags, chartNodeIdx) {
  const path = [];
  let current = chartNodeIdx;

  while (current !== -1) {
    const node = tags[current];
    if (isHeightAnchor(node) && path.length > 0) {
      // 锚点不包含在路径中
      break;
    }
    path.push(node);
    current = node.parentIndex;
  }

  return path; // [chartNode, ..., anchor 的直接子节点]
}

/**
 * 判断图表容器是否有固定高度（不需要修复）
 */
function hasFixedHeight(node) {
  const cls = node.classStr;
  if (FIXED_HEIGHT_RE.test(cls)) return true;
  const style = node.attrs.style || '';
  if (/height\s*:/.test(style)) return true;
  return false;
}

/**
 * 判断节点是否已有某个 class
 */
function hasClass(classStr, className) {
  return new RegExp(`(?:^|\\s)${className}(?:\\s|$)`).test(classStr);
}

/**
 * 判断节点是否已有 flex-direction 样式（行布局或列布局）
 * 返回 'row' | 'col' | 'row-reverse' | 'col-reverse' | null
 *
 * Tailwind 规则：
 * - flex = display: flex + flex-direction: row（默认）
 * - flex flex-col = display: flex + flex-direction: column
 * - flex-1 / flex-auto / flex-none 等不设置 display: flex，只是 flex 属性
 */
function getFlexDirection(node) {
  const cls = node.classStr;

  // 显式的 flex 容器类（flex 本身就隐含 flex-direction: row）
  if (hasClass(cls, 'flex')) return 'row';
  if (hasClass(cls, 'inline-flex')) return 'row';

  // 显式的方向类
  if (hasClass(cls, 'flex-row')) return 'row';
  if (hasClass(cls, 'flex-row-reverse')) return 'row-reverse';
  if (hasClass(cls, 'flex-col')) return 'col';
  if (hasClass(cls, 'flex-col-reverse')) return 'col-reverse';

  // 检查 style 属性中的 flex-direction
  const style = node.attrs.style || '';
  const flexDirectionMatch = style.match(/flex-direction\s*:\s*([^;]+)/i);
  if (flexDirectionMatch) {
    const value = flexDirectionMatch[1].trim().toLowerCase();
    if (value.includes('row')) return 'row';
    if (value.includes('column')) return 'col';
  }

  return null;
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

/**
 * 修复单个 HTML 文件
 */
function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  // 0. 检测并修复缺少 SVG 渲染器的 echarts.init 调用
  const rendererFix = patchRendererParam(content);
  if (rendererFix) {
    content = rendererFix.content;
  }

  // 1. 提取图表 ID
  const chartIds = extractChartIds(content);
  if (chartIds.length === 0) {
    console.log(`  ✓ ${fileName}：无 ECharts 图表`);
    return { fixed: false, chartCount: 0, fixes: [] };
  }

  // 2. 解析标签树
  const tags = rebuildTagTree(content, []);

  // 3. 为每个图表找到 DOM 节点
  const fixes = [];
  for (const chartId of chartIds) {
    const chartNode = tags.find(t => t.attrs.id === chartId);
    if (!chartNode) {
      console.warn(`  ⚠️  ${fileName}：未找到图表 DOM #${chartId}`);
      continue;
    }

    // 图表元素是否已有自身高度（如 h-full）
    // 即使已有，仍需检查父元素链的 Flex 链是否完整
    const chartHasHeight = hasFixedHeight(chartNode);

    // 获取到锚点的路径
    const pathNodes = getPathToAnchor(tags, chartNode.selfIndex);
    if (pathNodes.length === 0) {
      console.warn(`  ⚠️  ${fileName}：#${chartId} 无法找到到锚点的路径`);
      continue;
    }

    // 路径中最后一个节点是锚点的直接子节点
    // 图表元素本身是路径的第一个节点（pathNodes[0]）
    // 中间节点需要添加 flex flex-col overflow-hidden
    const nodeFixes = [];

    for (let i = 0; i < pathNodes.length; i++) {
      const node = pathNodes[i];
      const isChartElement = (i === 0);

      const neededClasses = [];

      if (isChartElement && !chartHasHeight) {
        // 图表容器本身需要 flex-1 min-h-0（仅当没有自身高度时）
        if (!hasClass(node.classStr, 'flex-1')) neededClasses.push('flex-1');
        if (!hasClass(node.classStr, 'min-h-0')) neededClasses.push('min-h-0');
      } else if (!isChartElement) {
        // 中间父元素需要 flex + overflow-hidden
        // 但要保持原有的 flex-direction（行/列布局）
        if (!hasClass(node.classStr, 'flex')) neededClasses.push('flex');
        if (!hasClass(node.classStr, 'overflow-hidden')) neededClasses.push('overflow-hidden');

        // 仅当没有任何 flex-direction 时，默认使用 flex-col
        const flexDirection = getFlexDirection(node);
        if (flexDirection === null) {
          if (!hasClass(node.classStr, 'flex-col')) neededClasses.push('flex-col');
        }
        // 如果已有 flex-row / flex-col 等，保持原有布局方向
      }

      if (neededClasses.length > 0) {
        nodeFixes.push({ node, neededClasses });
      }
    }

    if (nodeFixes.length > 0) {
      fixes.push({ chartId, nodeFixes });
    }
  }

  if (fixes.length === 0) {
    const rendererStatus = rendererFix ? '（renderer 已修复）' : '';
    console.log(`  ✓ ${fileName}：${chartIds.length} 个图表布局正确${rendererStatus}`);

    // 如果 renderer 有修复，也要写入文件
    if (rendererFix && !dryRun) {
      fs.writeFileSync(filePath, rendererFix.content, 'utf-8');
    }

    return { fixed: !!rendererFix, chartCount: chartIds.length, fixes: [], rendererFixed: !!rendererFix };
  }

  // 4. 应用修复到 HTML 内容
  let newContent = content;
  for (const { chartId, nodeFixes } of fixes) {
    const fixDesc = nodeFixes.map(f => {
      const tag = f.node;
      return `<${tag.tag}#${tag.attrs.id || ''}> +[${f.neededClasses.join(' ')}]`;
    }).join(', ');
    console.log(`  🔧 ${fileName}：#${chartId} → ${fixDesc}`);

    for (const { node, neededClasses } of nodeFixes) {
      // 在 HTML 中找到对应的开始标签，修改 class 属性
      newContent = patchClassAttr(newContent, node, neededClasses);
    }
  }

  if (!dryRun) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }

  return { fixed: true, chartCount: chartIds.length, fixes, rendererFixed: !!rendererFix };
}

/**
 * 在 HTML 内容中找到标签并修改其 class 属性
 */
function patchClassAttr(html, node, classesToAdd) {
  // 构建 class 属性的新值
  const newClassStr = addClasses(node.classStr, ...classesToAdd);

  // 在 HTML 中找到这个标签
  // 用 id 精确定位（如果有 id）
  if (node.attrs.id) {
    // 匹配带 id 的标签
    const re = new RegExp(
      `(<${node.tag}\\s[^>]*id\\s*=\\s*["']${escapeRegExp(node.attrs.id)}["'][^>]*class\\s*=\\s*["'])(${escapeRegExp(node.classStr)})(["'][^>]*>)`,
      's'
    );
    const match = html.match(re);
    if (match) {
      return html.replace(re, `$1${newClassStr}$3`);
    }

    // class 可能在 id 之前
    const re2 = new RegExp(
      `(<${node.tag}\\s[^>]*class\\s*=\\s*["'])(${escapeRegExp(node.classStr)})(["'][^>]*id\\s*=\\s*["']${escapeRegExp(node.attrs.id)}["'][^>]*>)`,
      's'
    );
    const match2 = html.match(re2);
    if (match2) {
      return html.replace(re2, `$1${newClassStr}$3`);
    }
  }

  // 无 id 的标签：基于位置查找
  // 用标签名 + 原始 class 来匹配
  const tagRe = new RegExp(
    `(<${node.tag})(\\s[^>]*class\\s*=\\s*["'])(${escapeRegExp(node.classStr)})(["'][^>]*>)`,
    'g'
  );
  let count = 0;
  let targetIndex = -1;

  // 找到第 N 个匹配（N = 同标签同类名中的第几个）
  // 这不够精确，但对我们的场景够用
  let m;
  const tempRe = new RegExp(tagRe.source, tagRe.flags);
  while ((m = tempRe.exec(html)) !== null) {
    if (m[3] === node.classStr) {
      // 通过标签位置来匹配
      // 简化处理：找到 class 完全匹配的第一个
      if (targetIndex === -1) {
        targetIndex = m.index;
        break;
      }
    }
  }

  if (targetIndex !== -1) {
    return html.substring(0, targetIndex) +
      html.substring(targetIndex).replace(tagRe, `$1$2${newClassStr}$4`);
  }

  console.warn(`    ⚠️  无法在 HTML 中定位 <${node.tag}> class="${node.classStr}"`);
  return html;
}

/**
 * 转义正则特殊字符
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 处理文件或目录
 */
function processTarget(target) {
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    if (!target.endsWith('.html') && !target.endsWith('.htm')) {
      console.error(`跳过非 HTML 文件：${target}`);
      return;
    }
    fixFile(target);
    return;
  }

  if (stat.isDirectory()) {
    const files = fs.readdirSync(target).filter(f => f.endsWith('.html') || f.endsWith('.htm'));
    if (files.length === 0) {
      console.log('未找到 HTML 文件');
      return;
    }
    for (const file of files) {
      fixFile(path.join(target, file));
    }
    return;
  }

  console.error(`无效路径：${target}`);
}

// ─── 主流程 ──────────────────────────────────────────────
if (dryRun) {
  console.log('🔍 [DRY RUN] ECharts 图表容器 Flex 链修复\n');
} else {
  console.log('🔧 ECharts 图表容器 Flex 链修复\n');
}

for (const target of targets) {
  if (!fs.existsSync(target)) {
    console.error(`错误：路径不存在 - ${target}`);
    continue;
  }
  processTarget(target);
}

console.log('\n✨ 完成！');
