#!/usr/bin/env node
/**
 * PPT HTML 校验/修复统一入口
 *
 * 用法：
 *   node pptx-check.js <目录>
 *   node pptx-check.js <目录> --check-only
 *   node pptx-check.js <目录> --fix
 *   node pptx-check.js <目录> --tags|--layout|--charts|--deps|--detect-overflow|--fix-overflow
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 解析参数
const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const fixMode = args.includes('--fix');
const singleMode = ['--tags', '--layout', '--charts', '--deps', '--detect-overflow', '--fix-overflow']
  .find(a => args.includes(a));
const targetDir = args.find(a => !a.startsWith('--'));

if (!targetDir) {
  console.error('用法: node pptx-check.js <目录> [--check-only|--fix|--tags|--layout|--charts|--deps|--detect-overflow|--fix-overflow]');
  process.exit(1);
}

// 脚本配置
const scripts = {
  tags: {
    name: 'HTML 标签校验',
    script: 'check/check-html-tags.js',
    args: [targetDir],
    stopOnFail: true,
  },
  layout: {
    name: '布局属性检查',
    script: 'check/check-layout-props.js',
    args: [targetDir, ...(fixMode ? ['--fix'] : [])],
    stopOnFail: false,
  },
  charts: {
    name: '图表容器修复',
    script: 'fix/fix-chart-layout.js',
    args: [targetDir, ...(checkOnly ? ['--dry-run'] : [])],
    stopOnFail: false,
  },
  deps: {
    name: 'CDN 依赖检查',
    script: 'check/check-html-deps.js',
    args: [targetDir],
    stopOnFail: false,
  },
  'detect-overflow': {
    name: '纵向溢出检测',
    script: 'analysis/analyze-overflow.js',
    args: [targetDir],
    stopOnFail: false,
  },
  'fix-overflow': {
    name: '纵向溢出修复',
    script: 'fix/fix-overflow.js',
    args: [targetDir],
    stopOnFail: false,
  }
};

// 确定要运行的脚本
const toRun = singleMode
  ? [singleMode.replace('--', '')]
  : ['tags', 'layout', 'charts', 'deps', 'detect-overflow'];

// --fix 模式下追加溢出修复
if (fixMode && !singleMode) {
  toRun.push('fix-overflow');
}

// 执行脚本
console.log('🔍 PPT HTML 校验/修复');
console.log(`📁 目标目录: ${targetDir}`);
console.log('='.repeat(50) + '\n');

let hasError = false;

for (const key of toRun) {
  const cfg = scripts[key];
  console.log(`\n▶ ${cfg.name}`);

  const result = spawnSync('node', [path.join(__dirname, cfg.script), ...cfg.args], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.log(`❌ ${cfg.name} 失败`);
    if (cfg.stopOnFail) {
      console.log('\n🛑 因基础检查失败，停止后续检查');
      process.exit(1);
    }
    hasError = true;
  } else {
    console.log(`✅ ${cfg.name} 完成`);
  }
}

console.log('\n' + '='.repeat(50));
if (hasError) {
  console.log('⚠️  部分检查发现问题，请查看上方详情');
  process.exit(1);
} else {
  console.log('✨ 所有检查通过！');
}
