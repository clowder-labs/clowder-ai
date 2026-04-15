#!/usr/bin/env node

/**
 * HTML 到 PPTX 转换脚本
 * 使用 Playwright 无头浏览器运行 dom-to-pptx
 * 支持单文件转换、目录批量转换和多文件合并转换
 * 
 * 改进点：
 * 1. 验证输出文件是否成功创建
 * 2. 清晰的输出路径显示
 * 3. 更好的错误处理和日志
 * 4. 支持多个HTML文件合并转换
 */

import { access, readFile, readdir, stat, writeFile } from 'fs/promises';
import { basename, dirname, join, resolve } from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// 全局浏览器实例（复用）
let sharedBrowser = null;

/**
 * 验证文件是否存在
 */
async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 主函数：HTML 文件或目录转 PPTX
 * 支持三种输入方式：
 * 1. 单个文件路径（字符串）：转换单个HTML文件
 * 2. 目录路径（字符串）：批量转换目录中的所有页面文件
 * 3. 文件路径数组（字符串数组）：合并转换多个HTML文件
 */
async function convertHtmlToPptx(inputPath, outputPath, options = {}) {
  // 判断输入类型
  if (Array.isArray(inputPath)) {
    // 文件路径数组：多文件合并转换
    return await convertDirectory(inputPath, outputPath, options);
  }
  
  // 单个路径：判断是文件还是目录
  const inputStat = await stat(inputPath);

  if (inputStat.isDirectory()) {
    return await convertDirectory(inputPath, outputPath, options);
  } else {
    return await convertSingleFile(inputPath, outputPath, options);
  }
}

/**
 * 单文件转换
 */
async function convertSingleFile(htmlPath, outputPath, options = {}) {
  const {
    selector = '.ppt-slide',
    slideWidth = 10,
    slideHeight = 5.625,
    svgAsEditable = true,
    autoEmbedFonts = true,
    timeout = 60000,
    reuseBrowser = true
  } = options;

  console.log(`📄 HTML 文件: ${htmlPath}`);

  console.log('🚀 启动浏览器...');
  const { browser, shouldCloseBrowser } = await getBrowser(reuseBrowser);

  const page = await browser.newPage();
  page.setDefaultTimeout(timeout);

  try {
    console.log('📝 加载 HTML 页面...');
    // 使用 file:// 协议加载，确保 CDN 资源能正确解析
    const fileUrl = 'file://' + resolve(htmlPath);
    await page.goto(fileUrl, { waitUntil: 'load' });
    console.log('✅ HTML 页面加载成功');

    // 等待一段时间，确保页面完全加载
    console.log('⏳ 等待页面完全加载...');
    await page.waitForTimeout(2000);
    console.log('✅ 页面加载完成');

    console.log('📦 加载依赖库...');
    await injectDependencies(page);
    console.log('✅ 依赖库加载成功');

    console.log('🔄 执行转换...');
    // 使用 base64 传输避免 OOM
    const base64Data = await page.evaluate(async ({ sel, opts }) => {
      const { exportToPptx } = window.domToPptx;
      const elements = Array.from(document.querySelectorAll(sel));
      if (elements.length === 0) {
        throw new Error(`未找到匹配选择器 "${sel}" 的元素`);
      }
      const blob = await exportToPptx(elements, opts);
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.readAsDataURL(blob);
      });
    }, {
      sel: selector,
      opts: { slideWidth, slideHeight, svgAsEditable, autoEmbedFonts }
    });

    const pptxBuffer = Buffer.from(base64Data, 'base64');

    console.log(`💾 保存 PPTX: ${outputPath}`);
    await writeFile(outputPath, pptxBuffer);

    // 验证文件是否成功保存
    if (await fileExists(outputPath)) {
      const stats = await stat(outputPath);
      console.log(`✅ 转换成功！文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      return { success: true, outputPath, size: stats.size };
    } else {
      throw new Error('文件保存失败：文件未创建');
    }

  } catch (error) {
    console.error('❌ 转换失败:', error.message);
    throw error;
  } finally {
    await page.close();
    if (shouldCloseBrowser) {
      await closeBrowser();
    }
  }
}

/**
 * 获取或创建浏览器实例
 */
async function getBrowser(reuseBrowser = true) {
  let browser = sharedBrowser;
  let shouldCloseBrowser = false;

  if (!browser) {
    console.log('🚀 启动浏览器...');
    try {
      browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      console.log('✅ 浏览器启动成功');
      if (reuseBrowser) {
        sharedBrowser = browser;
      } else {
        shouldCloseBrowser = true;
      }
    } catch (error) {
      console.error('❌ 浏览器启动失败:', error.message);
      throw error;
    }
  } else {
    console.log('♻️ 复用浏览器实例');
  }

  return { browser, shouldCloseBrowser };
}

/**
 * 目录批量转换或多文件合并转换
 * 支持两种输入方式：
 * 1. 目录路径（字符串）：扫描目录中的 page-N.pptx.html 文件
 * 2. 文件路径数组（字符串数组）：直接使用指定的文件列表
 * 
 * 逐页在完整 HTML 环境中独立渲染（Tailwind 编译、脚本执行、图表渲染），
 * 提取编译后 CSS + 处理后 HTML，通过 scoped wrapper 隔离各页样式，
 * 最终合并转换为单个 PPTX
 */
async function convertDirectory(input, outputPath, options = {}) {
  const {
    selector = '.ppt-slide',
    slideWidth = 10,
    slideHeight = 5.625,
    svgAsEditable = true,
    autoEmbedFonts = true,
    timeout = 60000,
    reuseBrowser = true
  } = options;

  // 判断输入类型：字符串（目录路径）或数组（文件路径列表）
  let files;
  if (Array.isArray(input)) {
    // 文件路径数组
    console.log(`📄 将合并 ${input.length} 个 HTML 文件`);
    // 验证所有文件存在
    for (const path of input) {
      try {
        await stat(path);
      } catch {
        throw new Error(`文件不存在: ${path}`);
      }
    }
    files = input;
  } else {
    // 目录路径
    files = await findPageFiles(input);
    if (files.length === 0) {
      throw new Error(`目录 ${input} 中未找到 page-N.pptx.html 文件`);
    }
    console.log(`📂 找到 ${files.length} 个页面文件`);
  }

  const { browser, shouldCloseBrowser } = await getBrowser(reuseBrowser);
  // 收集每页的 { scopedCss, slideHtmls }
  const pageResults = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const pageIndex = i + 1;
    console.log(`📄 渲染页面 ${pageIndex}/${files.length}: ${basename(file)}`);

    const page = await browser.newPage();
    page.setDefaultTimeout(timeout);

    try {
      console.log(`  📝 加载 HTML 页面...`);
      // 1. 使用 file:// 协议加载（Tailwind CDN 编译、脚本执行），确保相对路径能正确解析
      const fileUrl = 'file://' + resolve(file);
      await page.goto(fileUrl, { waitUntil: 'load' });

      // 2. 等待 networkidle，确保 CDN 资源和脚本加载完成
      try {
        console.log(`  ⏳ 等待网络空闲...`);
        await page.waitForLoadState('networkidle', { timeout: 15000 });
        console.log(`  ✅ 网络空闲完成`);
      } catch (err) {
        console.log(`  ⏳ 页面 ${pageIndex} networkidle 超时，继续处理...`, err.message);
      }

      // 3. 额外等待，确保 ECharts 等图表完成渲染
      console.log(`  ⏳ 等待图表渲染...`);
      await page.waitForTimeout(1000);
      console.log(`  ✅ 图表渲染完成`);

      // 4. 在浏览器端提取编译后 CSS + 处理后 slide HTML
      console.log(`  🔄 提取 CSS 和幻灯片内容...`);
      const result = await page.evaluate(({ sel, pageIdx }) => {
        try {
          // --- 提取所有编译后的 CSS ---
          const cssTexts = [];
          // 收集跨域样式表的 href（如 FontAwesome CDN），这些无法读取 cssRules
          const externalLinks = [];
          for (const sheet of document.styleSheets) {
            try {
              const rules = sheet.cssRules || sheet.rules;
              if (!rules) continue;
              for (const rule of rules) {
                cssTexts.push(rule.cssText);
              }
            } catch {
              // 跨域样式表无法访问，记录 href 以便在合并文档中引入
              if (sheet.href) {
                externalLinks.push(sheet.href);
              }
            }
          }

          // --- 从 body/html/:root/* 规则中提取 background-color 用于合并文档 ---
          let bodyBgColor = '';
          function extractBgFromRule(rule) {
            const match = rule.match(/background-color\s*:\s*([^;]+);/i)
              || rule.match(/background\s*:\s*([^;]+);/i);
            if (match) return match[1].trim();
            return null;
          }

          // --- 给 CSS 规则添加 scope 前缀 ---
          const scopeAttr = `data-page-${pageIdx}`;
          const scopedRules = [];

          cssTexts.forEach(rule => {
            // 跳过 @keyframes / @font-face 等 at-rule（不加前缀）
            if (rule.startsWith('@keyframes') || rule.startsWith('@font-face')) {
              scopedRules.push(rule);
              return;
            }
            // @media 等需要处理内部规则
            if (rule.startsWith('@media') || rule.startsWith('@supports') || rule.startsWith('@layer')) {
              scopedRules.push(rule.replace(/([^{}]+)\{/g, (match, selectorPart, offset) => {
                if (offset === rule.indexOf('{')) return match;
                return scopeSelector(selectorPart, scopeAttr) + '{';
              }));
              // 也从 @media 规则中提取 body 背景
              if (!bodyBgColor && /body|html|:root/.test(rule)) {
                const bg = extractBgFromRule(rule);
                if (bg) bodyBgColor = bg;
              }
              return;
            }
            // 普通规则：提取选择器部分加 scope
            const braceIdx = rule.indexOf('{');
            if (braceIdx === -1) { scopedRules.push(rule); return; }
            const selectorPart = rule.substring(0, braceIdx);
            const rest = rule.substring(braceIdx);

            // 检测 body/html/:root 规则，提取背景色用于合并文档
            const selectors = selectorPart.split(',').map(s => s.trim());
            const isBodyRule = selectors.some(s => s === 'body' || s === 'html' || s === ':root');
            if (isBodyRule && !bodyBgColor) {
              const bg = extractBgFromRule(rule);
              if (bg) bodyBgColor = bg;
            }
            scopedRules.push(scopeSelector(selectorPart, scopeAttr) + rest);
          });

          function scopeSelector(selectorText, attr) {
            // 多个选择器用逗号分隔，每个都加 scope
            return selectorText.split(',').map(s => {
              s = s.trim();
              if (!s) return s;
              // 对 *, html, body, :root 等全局选择器，替换为 scope wrapper
              if (s === '*' || s === '::before' || s === '::after'
                  || s === '*, ::before, ::after' || s === ':root'
                  || s === 'html' || s === 'body') {
                return `[${attr}] ${s === 'html' || s === 'body' || s === ':root' ? '' : s}`.trim() || `[${attr}]`;
              }
              // 其他选择器：在最前面加 scope 属性选择器
              return `[${attr}] ${s}`;
            }).join(', ');
          }

          // --- 将 ECharts canvas 转为 base64 图片 ---
          function convertCanvasToImage(container) {
            const canvases = container.querySelectorAll('canvas');
            canvases.forEach(canvas => {
              try {
                const dataUrl = canvas.toDataURL('image/png');
                const img = document.createElement('img');
                img.src = dataUrl;
                // 继承 canvas 容器的尺寸
                const rect = canvas.getBoundingClientRect();
                img.style.width = rect.width + 'px';
                img.style.height = rect.height + 'px';
                img.style.display = 'block';
                canvas.parentNode.replaceChild(img, canvas);
              } catch (e) {
                console.warn('Canvas 转图片失败:', e.message);
              }
            });
          }

          // --- 提取 slide HTML ---
          const slides = document.querySelectorAll(sel);
          const slideHtmls = Array.from(slides).map(slide => {
            convertCanvasToImage(slide);
            return slide.outerHTML;
          });

          // CSS 规则中没有提取到背景色时，使用 computed style 兜底
          // 适用于 Tailwind 类名（如 bg-gray-50）的情况
          if (!bodyBgColor) {
            const csBg = window.getComputedStyle(document.body).backgroundColor;
            if (csBg && csBg !== 'transparent' && csBg !== 'rgba(0, 0, 0, 0)') {
              bodyBgColor = csBg;
            }
          }

          return {
            scopedCss: scopedRules.join('\n'),
            slideHtmls,
            externalLinks,
            bodyBgColor
          };
        } catch (err) {
          console.error('页面处理失败:', err.message);
          return {
            scopedCss: '',
            slideHtmls: [],
            externalLinks: [],
            bodyBgColor: ''
          };
        }
      }, { sel: selector, pageIdx: pageIndex });

      if (result.slideHtmls.length === 0) {
        console.warn(`⚠️ 文件 ${basename(file)} 中未找到 ${selector} 元素`);
      } else {
        console.log(`  ✓ 提取 ${result.slideHtmls.length} 个幻灯片，CSS ${(result.scopedCss.length / 1024).toFixed(1)}KB`);
        pageResults.push({
          pageIndex,
          scopedCss: result.scopedCss,
          slideHtmls: result.slideHtmls,
          externalLinks: result.externalLinks,
          bodyBgColor: result.bodyBgColor
        });
      }
    } catch (err) {
      console.error(`❌ 处理页面 ${pageIndex} 失败:`, err.message);
    } finally {
      console.log(`  🔒 关闭页面...`);
      await page.close();
      console.log(`  ✅ 页面已关闭`);
    }
  }

  const totalSlides = pageResults.reduce((sum, p) => sum + p.slideHtmls.length, 0);
  console.log(`🎨 共收集 ${totalSlides} 个幻灯片，开始合并转换...`);

  // 构建合并 HTML：每页 slide 包裹在 scoped wrapper 中，CSS 通过 scope 属性隔离
  const mergedHtml = await buildMergedHtml(pageResults);

  const page = await browser.newPage();
  page.setDefaultTimeout(timeout);

  try {
    await page.setContent(mergedHtml, { waitUntil: 'load' });
    await injectDependencies(page);

    // 使用 base64 传输避免 OOM：Array.from(Uint8Array) 会把每个字节变成一个 JS Number 对象
    // 100MB PPTX → 1亿个 Number 对象 → 2-3GB V8 堆
    // base64 只需 133MB 字符串，V8 处理效率远高于 1 亿个独立对象
    const base64Data = await page.evaluate(async ({ sel, opts }) => {
      const { exportToPptx } = window.domToPptx;
      const elements = Array.from(document.querySelectorAll(sel));
      const blob = await exportToPptx(elements, opts);
      // 用 FileReader.readAsDataURL 转 base64，比 Array.from 省内存
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          // 结果格式: "data:application/octet-stream;base64,AAAA..."
          const result = reader.result;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(blob);
      });
    }, {
      sel: selector,
      opts: { slideWidth, slideHeight, svgAsEditable, autoEmbedFonts }
    });

    const pptxBuffer = Buffer.from(base64Data, 'base64');

    console.log(`💾 保存 PPTX: ${outputPath}`);
    await writeFile(outputPath, pptxBuffer);

    // 验证文件是否成功保存
    if (await fileExists(outputPath)) {
      const stats = await stat(outputPath);
      console.log(`✅ 转换成功！文件大小: ${(stats.size / 1024).toFixed(2)} KB`);
      return { success: true, outputPath, size: stats.size };
    } else {
      throw new Error('文件保存失败：文件未创建');
    }

  } catch (error) {
    console.error('❌ 目录转换失败:', error.message);
    throw error;
  } finally {
    await page.close();
    if (shouldCloseBrowser) {
      await closeBrowser();
    }
  }
}

/**
 * 扫描目录中的页面文件并按序号排序
 */
async function findPageFiles(dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = entries
    .filter(e => e.isFile() && /^page-(\d+)\.pptx\.html$/.test(e.name))
    .map(e => ({
      path: join(dirPath, e.name),
      num: parseInt(e.name.match(/^page-(\d+)/)[1])
    }))
    .sort((a, b) => a.num - b.num)
    .map(f => f.path);
  return files;
}

/**
 * 构建合并的 HTML 文档
 * 每页的 CSS 通过 [data-page-N] 属性选择器隔离，避免不同页面的
 * Tailwind 配置、自定义样式互相冲突
 */
async function buildMergedHtml(pageResults) {
  // 收集所有 scoped CSS
  const allCss = pageResults.map(p => `/* === Page ${p.pageIndex} === */\n${p.scopedCss}`).join('\n\n');

  // 收集所有外部样式表链接（去重）
  // 区分本地 file:// 和远程 http:// 链接：
  // - 远程链接用 <link> 标签引入
  // - 本地 file:// 链接直接读取文件内容内联为 <style>，因为 page.setContent() 无法加载 file:// 的 <link>
  const allExternalLinks = [...new Set(pageResults.flatMap(p => p.externalLinks))];
  const remoteLinks = allExternalLinks.filter(href => href.startsWith('http://') || href.startsWith('https://'));
  const localLinks = allExternalLinks.filter(href => href.startsWith('file://'));

  const linkTags = remoteLinks.map(href => `  <link href="${href}" rel="stylesheet" />`).join('\n');

  // 读取本地样式表文件并内联（不加 scope，保留原始规则）
  let localInlineCss = '';
  for (const fileHref of localLinks) {
    try {
      const filePath = decodeURIComponent(new URL(fileHref).pathname);
      const cssContent = await readFile(filePath, 'utf-8');
      if (cssContent) {
        localInlineCss += `\n/* === Inline: ${basename(filePath)} === */\n${cssContent}\n`;
        console.log(`  📎 内联本地样式表: ${basename(filePath)} (${(cssContent.length / 1024).toFixed(1)}KB)`);
      }
    } catch (e) {
      console.warn(`  ⚠️ 读取本地样式表失败: ${fileHref} - ${e.message}`);
    }
  }

  // 使用从原始 CSS 中提取的 body 背景色（而非 computed style），避免硬编码颜色覆盖
  const bodyBgColor = pageResults.find(p => p.bodyBgColor && p.bodyBgColor !== 'transparent')?.bodyBgColor || '#1a1a2e';

  // 每页的 slide 包裹在带 scope 属性的 wrapper 中
  const allSlides = pageResults.map(p => {
    const attr = `data-page-${p.pageIndex}`;
    return p.slideHtmls.map(html => `<div ${attr}>\n${html}\n</div>`).join('\n');
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
${linkTags}
  <style>
    body { background: ${bodyBgColor}; margin: 0; padding: 40px; }
${allCss}
  </style>
${localInlineCss ? `  <style>\n${localInlineCss}\n  </style>` : ''}
</head>
<body>
${allSlides}
</body>
</html>`;
}

/**
 * 注入依赖库
 */
async function injectDependencies(page) {
  // WASM URL：使用自建 CDN（assets 已迁移到 CDN）
  const wasmUrl = 'https://cdn.digitalhumanai.top/slidagent/pptx-craft/assets/fonteditor-core@2.6.3/woff2/woff2.wasm';
  const mirrorUrl = 'https://npmmirror.com/mirrors/fonteditor-core@2.6.3/woff2/woff2.wasm';

  // 设置字体嵌入配置
  await page.addInitScript(() => {
    window.EMBED_FONTS_CONFIG = {
      woff2: {
        wasmUrl: arguments[0],
        mirrorUrl: arguments[1],
        optional: true
      }
    };
  }, wasmUrl, mirrorUrl);

  console.log('✅ 字体嵌入配置设置成功（CDN WASM）');

  // 使用已打包的 dom-to-pptx bundle
  const bundlePath = resolve(__dirname, '..', 'dist', 'dom-to-pptx.bundle.js');
  console.log(`📦 读取打包文件: ${bundlePath}`);
  
  // 使用 addScriptTag 注入脚本
  console.log('📄 注入脚本...');
  await page.addScriptTag({ path: bundlePath });
  console.log('✅ 脚本注入成功');

  // 等待模块加载完成
  try {
    console.log('⏳ 等待模块加载完成...');
    await page.waitForFunction(() => typeof window.domToPptx?.exportToPptx === 'function', { timeout: 10000 });
    console.log('✅ 模块加载完成');
  } catch (e) {
    // 调试：检查 window.domToPptx 的值
    const domToPptxExists = await page.evaluate(() => typeof window.domToPptx !== 'undefined');
    const exportToPptxExists = await page.evaluate(() => typeof window.domToPptx?.exportToPptx !== 'undefined');
    console.log('Debug: window.domToPptx exists:', domToPptxExists);
    console.log('Debug: window.domToPptx.exportToPptx exists:', exportToPptxExists);
    throw e;
  }
}

/**
 * 关闭共享浏览器
 */
async function closeBrowser() {
  if (sharedBrowser) {
    await sharedBrowser.close();
    sharedBrowser = null;
  }
}

/**
 * CLI 入口
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
用法: node convert.js <输入路径> [输出文件] [选项]

参数:
  输入路径      输入的 HTML 文件路径、包含 page-N.pptx.html 的目录，或多个 HTML 文件
  输出文件      输出的 PPTX 文件路径（可选，默认为同名 .pptx 或目录名.pptx）

选项:
  --selector         CSS 选择器（默认: .ppt-slide）
  --width            幻灯片宽度（英寸，默认: 10）
  --height           幻灯片高度（英寸，默认: 5.625）
  --timeout          超时时间（毫秒，默认: 60000）
  --no-svg-editable  禁用 SVG 可编辑转换（默认启用）
  --no-embed-fonts   禁用自动字体嵌入（默认启用）

示例:
  # 单文件转换
  node convert.js input.html
  node convert.js input.html output.pptx
  node convert.js input.html --selector=".slide" --width=10

  # 目录批量转换（合并为单个 PPTX）
  node convert.js ./pages/
  node convert.js ./pages/ output.pptx

  # 多文件合并转换
  node convert.js page1.html page2.html page3.html output.pptx
    `);
    process.exit(0);
  }

  // 解析选项
  const options = {};
  let nonOptionArgs = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--no-')) {
      // --no-svg-editable → svgAsEditable = false
      const key = arg.slice(5); // 去掉 --no-
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      options[camelKey] = false;
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      // 尝试将值转换为数字
      if (value !== undefined) {
        const numValue = Number(value);
        options[camelKey] = isNaN(numValue) ? value : numValue;
      } else {
        options[camelKey] = true;
      }
    } else {
      nonOptionArgs.push(arg);
    }
  }

  // 判断是单文件/目录转换还是多文件合并转换
  let inputPath, outputPath;
  let isMultipleFiles = false;

  if (nonOptionArgs.length === 1) {
    // 单个输入（文件或目录）
    inputPath = resolve(nonOptionArgs[0]);
    outputPath = null;
  } else if (nonOptionArgs.length === 2) {
    // 两个参数：输入 + 输出
    inputPath = resolve(nonOptionArgs[0]);
    outputPath = resolve(nonOptionArgs[1]);
  } else {
    // 多个参数：多个 HTML 文件 + 输出
    isMultipleFiles = true;
    outputPath = resolve(nonOptionArgs[nonOptionArgs.length - 1]);
    inputPath = nonOptionArgs.slice(0, -1).map(p => resolve(p));
  }

  // 默认输出路径（仅对单文件/目录转换）
  if (!isMultipleFiles && (!outputPath || outputPath.startsWith('--'))) {
    const inputStat = await stat(inputPath);
    if (inputStat.isDirectory()) {
      // 目录输入：输出到目录名.pptx
      outputPath = join(inputPath, '..', basename(inputPath) + '.pptx');
    } else {
      // 文件输入：输出到同名 .pptx
      outputPath = inputPath.replace(/\.pptx\.html$/, '.pptx').replace(/\.html$/, '.pptx');
    }
  }
  
  if (outputPath) {
    outputPath = resolve(outputPath);
  }

  // 显示转换信息
  console.log('========================================');
  console.log('🚀 HTML 到 PPTX 转换工具');
  console.log('========================================');
  if (isMultipleFiles) {
    console.log(`📁 输入: ${inputPath.length} 个文件`);
    inputPath.forEach((p, i) => console.log(`   ${i + 1}. ${p}`));
  } else {
    console.log(`📁 输入: ${inputPath}`);
  }
  console.log(`📄 输出: ${outputPath}`);
  console.log('----------------------------------------');

  try {
    console.log('🔄 开始转换...');
    const result = await convertHtmlToPptx(inputPath, outputPath, options);
    
    console.log('----------------------------------------');
    console.log('✅ 转换完成！');
    console.log(`📄 输出文件: ${result.outputPath}`);
    console.log(`📊 文件大小: ${(result.size / 1024).toFixed(2)} KB`);
    console.log('========================================');
  } catch (error) {
    console.error('----------------------------------------');
    console.error('❌ 转换失败:', error.message);
    console.error('错误堆栈:', error.stack);
    console.error('========================================');
    process.exit(1);
  } finally {
    console.log('🔒 关闭浏览器...');
    await closeBrowser();
    console.log('✅ 浏览器已关闭');
  }
}

// 强制执行 main
main().catch(err => {
  console.error('执行失败:', err);
  process.exit(1);
});

export { closeBrowser, convertHtmlToPptx };

