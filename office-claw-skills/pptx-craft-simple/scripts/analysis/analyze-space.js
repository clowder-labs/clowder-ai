#!/usr/bin/env node

/**
 * PPTX.html 空白空间分析脚本
 * 使用 Playwright 分析.ppt-slide 容器的上下空白空间
 */

import { chromium } from 'playwright';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * 分析单个 HTML 文件的空白空间
 */
async function analyzeFile(browser, filePath) {
  const htmlContent = await readFile(filePath, 'utf-8');
  const fileName = filePath.split('/').pop();

  const page = await browser.newPage();
  await page.setContent(htmlContent, { waitUntil: 'load' });

  const results = await page.evaluate(() => {
    // 生成元素的 CSS 选择器路径
    function generateSelectorPath(element) {
      const path = [];
      let current = element;

      while (current && current.tagName && current.tagName.toLowerCase() !== 'body') {
        let selector = current.tagName.toLowerCase();

        if (current.id) {
          selector += `#${current.id}`;
        } else if (current.className && typeof current.className === 'string') {
          const classes = current.className.trim().split(/\s+/).filter(c => c);
          if (classes.length > 0) {
            selector += '.' + classes.join('.');
          }
        }

        const parent = current.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children).filter(
            c => c.tagName === current.tagName
          );
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
          }
        }

        path.unshift(selector);
        current = current.parentElement;
      }

      return 'body > ' + path.join(' > ');
    }

    // 分析单个容器的上下空白
    function analyzeContainer(container) {
      const containerRect = container.getBoundingClientRect();
      const containerHeight = containerRect.height;

      // 收集元素子节点的边界
      const elementChildren = Array.from(container.children)
        .map(child => {
          const rect = child.getBoundingClientRect();
          return {
            top: rect.top - containerRect.top,
            bottom: rect.bottom - containerRect.top,
            height: rect.height,
            width: rect.width
          };
        })
        .filter(child => child.height > 0 && child.width > 0);

      // 收集直接文本子节点的边界
      const textChildren = Array.from(container.childNodes)
        .filter(node => node.nodeType === 3 && node.textContent.trim().length > 0)
        .map(textNode => {
          const range = document.createRange();
          range.selectNodeContents(textNode);
          const rect = range.getBoundingClientRect();
          return {
            top: rect.top - containerRect.top,
            bottom: rect.bottom - containerRect.top,
            height: rect.height,
            width: rect.width
          };
        })
        .filter(child => child.height > 0 && child.width > 0);

      const children = [...elementChildren, ...textChildren];

      if (children.length === 0) return null;

      children.sort((a, b) => a.top - b.top);

      const thresholdPercent = containerHeight * 0.4;
      const thresholdPx = 60;
      const spaces = [];

      // 顶部空白
      const topGap = children[0].top;
      if (topGap >= thresholdPercent || topGap >= thresholdPx) {
        spaces.push({
          position: 'top',
          gap_height: Math.round(topGap)
        });
      }

      // 底部空白
      const maxBottom = Math.max(...children.map(c => c.bottom));
      const bottomGap = containerHeight - maxBottom;
      if (bottomGap >= thresholdPercent || bottomGap >= thresholdPx) {
        spaces.push({
          position: 'bottom',
          gap_height: Math.round(bottomGap)
        });
      }

      return spaces;
    }

    // 递归查找所有可能包含空白的容器
    function findContainersWithSpaces(element, results = []) {
      const spaces = analyzeContainer(element);
      if (spaces && spaces.length > 0) {
        results.push({
          selector: generateSelectorPath(element),
          container_height: Math.round(element.getBoundingClientRect().height),
          available_spaces: spaces
        });
      }

      // 递归遍历子元素
      for (const child of element.children) {
        // 只遍历可能有子元素的容器元素
        if (child.children.length > 0) {
          findContainersWithSpaces(child, results);
        }
      }

      return results;
    }

    const slides = document.querySelectorAll('.ppt-slide[type="content"]');
    const slideResults = [];

    slides.forEach((slide, index) => {
      const containers = findContainersWithSpaces(slide);

      if (containers.length > 0) {
        slideResults.push({
          file: 'CURRENT_FILE',
          containers: containers
        });
      }
    });

    return slideResults;
  });

  await page.close();

  // 替换文件名
  return results.map(r => ({
    ...r,
    file: fileName
  }));
}

/**
 * 主函数
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.error('用法：node analyze-space.js <input-dir> [output-file]');
    console.error('  input-dir: 包含 pptx.html 文件的目录');
    console.error('  output-file: 输出 JSON 文件路径（可选，默认为 input-dir/space-analysis.json）');
    process.exit(1);
  }

  const inputDir = resolve(args[0]);
  const outputFile = args[1] || join(inputDir, 'space-analysis.json');

  console.log(`扫描目录：${inputDir}`);
  console.log(`输出文件：${outputFile}`);

  // 查找所有 pptx.html 文件
  const files = [];
  async function scanDir(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanDir(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.pptx.html')) {
        files.push(fullPath);
      }
    }
  }
  await scanDir(inputDir);

  console.log(`找到 ${files.length} 个 pptx.html 文件`);

  // 启动浏览器
  const browser = await chromium.launch({ headless: true });

  try {
    const allResults = [];

    for (const file of files) {
      console.log(`分析：${file.split('/').pop()}`);
      const results = await analyzeFile(browser, file);
      allResults.push(...results);
    }

    // 统计有可用空间的容器数量
    const totalContainers = allResults.reduce(
      (sum, r) => sum + (r.containers?.length || 0),
      0
    );

    const report = {
      summary: {
        total_files: files.length,
        total_containers_with_spaces: allResults.length,
        total_spaces_available: totalContainers,
        filter_threshold: {
          percent: '40%',
          min_px: 60
        }
      },
      results: allResults
    };

    // 写入输出
    await writeFile(outputFile, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n报告已写入：${outputFile}`);
    console.log(`有空白空间的容器：${allResults.length}`);
    console.log(`总空白区域：${totalContainers}`);

  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('错误:', err);
  process.exit(1);
});
