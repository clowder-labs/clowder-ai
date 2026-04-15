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
import { log, warn, error, configureFromArgs } from './utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 解析参数
const args = process.argv.slice(2);
configureFromArgs(args);
const checkOnly = args.includes('--check-only');
const fixMode = args.includes('--fix');
const singleMode = ['--tags', '--layout', '--charts', '--deps', '--detect-overflow', '--fix-overflow']
  .find(a => args.includes(a));
const targetDir = args.find(a => !a.startsWith('--'));

if (!targetDir) {
  error('用法: node pptx-check.js <目录> [--check-only|--fix|--tags|--layout|--charts|--deps|--detect-overflow|--fix-overflow]');
  process.exit(1);
}

// 脚本配置
// 除 tags 外，子脚本默认 --log-level=error，只透传致命错误信息
const scripts = {
  tags: {
    name: 'HTML 标签校验',
    script: 'check/check-html-tags.js',
    args: [targetDir],
    stopOnFail: true,
  },
  layout: {
    name: '布局属性检查',
    script: 'fix/fix-layout-props.js',
    args: [targetDir, ...(fixMode ? ['--fix'] : []), '--log-level=error'],
    stopOnFail: false,
  },
  charts: {
    name: '图表容器修复',
    script: 'fix/fix-chart-layout.js',
    args: [targetDir, ...(checkOnly ? ['--dry-run'] : []), '--log-level=error'],
    stopOnFail: false,
  },
  deps: {
    name: 'CDN 依赖检查',
    script: 'fix/fix-html-deps.js',
    args: [targetDir, '--log-level=error'],
    stopOnFail: false,
  },
  'detect-overflow': {
    name: '纵向溢出检测',
    script: 'analysis/analyze-overflow.js',
    args: [targetDir, '--log-level=error'],
    stopOnFail: false,
  },
  'fix-overflow': {
    name: '纵向溢出修复',
    script: 'fix/fix-overflow.js',
    args: [targetDir, '--log-level=error'],
    stopOnFail: false,
  }
};

// 确定要运行的脚本
const toRun = singleMode
  ? [singleMode.replace('--', '')]
  : [
    'tags', 
    'layout', 
    'charts', 
    'deps', 
    'detect-overflow'
  ];

// --fix 模式下追加溢出修复
if (fixMode && !singleMode) {
  toRun.push('fix-overflow');
}

// 执行脚本
log('🔍 PPT HTML 校验/修复');
log(`📁 目标目录: ${targetDir}`);
log('='.repeat(50) + '\n');

let hasError = false;

for (const key of toRun) {
  const cfg = scripts[key];
  log(`\n▶ ${cfg.name}`);

  const result = spawnSync('node', [path.join(__dirname, cfg.script), ...cfg.args], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    warn(`❌ ${cfg.name} 失败`);
    if (cfg.stopOnFail) {
      error('\n🛑 因基础检查失败，停止后续检查');
      process.exit(1);
    }
    hasError = true;
  } else {
    log(`✅ ${cfg.name} 完成`);
  }
}

log('\n' + '='.repeat(50));
if (hasError) {
  warn('⚠️  部分检查发现问题，请查看上方详情');
  process.exit(1);
} else {
  log('✨ 所有检查通过！');
}
