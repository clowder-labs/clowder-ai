#!/usr/bin/env node

/**
 * Phase 0: Public Artifact Gate — 禁词扫描 + 产物校验
 *
 * 两级扫描:
 *   Hard gate — 扫描 npm pack 产物 / bundle manifest，命中即阻断发布
 *   Soft gate — 扫描源码（排除白名单），命中仅 warning
 *
 * Usage:
 *   node scripts/check-public-gate.mjs              # 完整扫描（hard + soft）
 *   node scripts/check-public-gate.mjs --hard-only   # 仅 hard gate
 *   node scripts/check-public-gate.mjs --soft-only   # 仅 soft gate
 *   node scripts/check-public-gate.mjs --json         # JSON 输出（CI 用）
 *
 * Exit codes:
 *   0 — hard gate 通过
 *   1 — hard gate 命中（阻断发布）
 *   2 — 脚本错误
 *
 * [宪宪/Opus-46🐾] Phase 0 发布门禁
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

// ─── 配置 ─────────────────────────────────────────────

/** 禁词词典（大小写不敏感） */
const FORBIDDEN_TERMS = [
  'OfficeClaw',
  'officeclaw',
  'Huawei',
  'huawei',
  'ModelArts',
  'modelarts',
  'lightmake\\.site',
  'jiuwenclaw',
  'maas-details',
  'XiaoYi',
  'xiaoyi',
  'huawei_maas',
  'HUAWEI_MAAS',
];

/** 组合成一个大正则（大小写不敏感） */
const FORBIDDEN_REGEX = new RegExp(
  FORBIDDEN_TERMS.map((t) => `(${t})`).join('|'),
  'gi',
);

/** Hard gate 扫描的文件扩展名（产物级） */
const HARD_GATE_EXTENSIONS = new Set([
  '.js', '.mjs', '.cjs',
  '.json',
  '.ts', '.tsx',  // 仅用于 npm pack 产物中出现的类型声明
  '.css',
  '.html',
  '.svg',
]);

/** Soft gate 扫描的源码扩展名 */
const SOFT_GATE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json',
]);

/** Soft gate 白名单路径前缀（相对项目根） */
const SOFT_GATE_WHITELIST_PREFIXES = [
  'docs/',
  'editions/',
  'CLAUDE.md',
  'AGENTS.md',
  'GEMINI.md',
  'BACKLOG.md',
  '.claude/',
  'node_modules/',
  '.next/',
  '.git/',
  'dist/',
  'clowder-ai-feature-list',
];

/** Soft gate 白名单文件名模式 */
const SOFT_GATE_WHITELIST_NAMES = [
  'binary-core-product-line',
  'check-public-gate',  // 本脚本自身
];

/** 需要 npm pack 扫描的包目录 */
const PACKAGES_TO_SCAN = [
  'packages/api',
  'packages/web',
  'packages/shared',
  'packages/mcp-server',
];

// ─── 工具函数 ─────────────────────────────────────────

const PROJECT_ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function isWhitelisted(relPath) {
  for (const prefix of SOFT_GATE_WHITELIST_PREFIXES) {
    if (relPath.startsWith(prefix)) return true;
  }
  for (const name of SOFT_GATE_WHITELIST_NAMES) {
    if (relPath.includes(name)) return true;
  }
  // .md 文件在 soft gate 中豁免（文档合法引用）
  if (extname(relPath) === '.md') return true;
  return false;
}

/**
 * 递归收集文件（跳过 node_modules / .git / .next / dist）
 */
function collectFiles(dir, extensions, maxDepth = 10) {
  const results = [];
  if (maxDepth <= 0) return results;

  const skipDirs = new Set(['node_modules', '.git', '.next', 'dist', '.pnpm']);

  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, extensions, maxDepth - 1));
    } else if (entry.isFile() && extensions.has(extname(entry.name))) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * 扫描单个文件，返回命中行
 */
function scanFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return [];
  }

  const hits = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = line.match(FORBIDDEN_REGEX);
    if (matches) {
      hits.push({
        line: i + 1,
        term: [...new Set(matches)].join(', '),
        preview: line.trim().slice(0, 120),
      });
    }
  }
  return hits;
}

// ─── Hard Gate: npm pack 产物扫描 ───────────────────────

function runHardGate() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  HARD GATE — npm pack 产物禁词扫描');
  console.log('══════════════════════════════════════════════\n');

  const allHits = [];

  for (const pkgDir of PACKAGES_TO_SCAN) {
    const absDir = join(PROJECT_ROOT, pkgDir);
    if (!existsSync(join(absDir, 'package.json'))) {
      console.log(`  ⏭  ${pkgDir} — no package.json, skipping`);
      continue;
    }

    console.log(`  📦 ${pkgDir} — npm pack --dry-run...`);

    let packOutput;
    try {
      packOutput = execSync('npm pack --dry-run --json 2>/dev/null', {
        cwd: absDir,
        encoding: 'utf-8',
        timeout: 30_000,
      });
    } catch {
      // npm pack --json 可能不在所有版本可用，fallback 到文件列表
      try {
        packOutput = execSync('npm pack --dry-run 2>&1', {
          cwd: absDir,
          encoding: 'utf-8',
          timeout: 30_000,
        });
      } catch (e) {
        console.log(`     ⚠️  npm pack failed: ${e.message}`);
        continue;
      }
    }

    // 解析文件列表
    let files = [];
    try {
      const parsed = JSON.parse(packOutput);
      if (Array.isArray(parsed) && parsed[0]?.files) {
        files = parsed[0].files.map((f) => f.path);
      }
    } catch {
      // 非 JSON 输出，按行解析文件名
      files = packOutput
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('npm') && !l.startsWith('Tarball'));
    }

    // 扫描每个会被打包的文件
    for (const relFile of files) {
      const absFile = join(absDir, relFile);
      if (!existsSync(absFile)) continue;
      if (!HARD_GATE_EXTENSIONS.has(extname(relFile))) continue;

      const hits = scanFile(absFile);
      if (hits.length > 0) {
        allHits.push({
          package: pkgDir,
          file: relFile,
          hits,
        });
      }
    }
  }

  // Bundle manifest 扫描（如果存在）
  const bundleDir = join(PROJECT_ROOT, 'dist/windows/bundle');
  if (existsSync(bundleDir)) {
    console.log('  📦 dist/windows/bundle — bundle 产物扫描...');
    const bundleFiles = collectFiles(bundleDir, HARD_GATE_EXTENSIONS, 5);
    for (const absFile of bundleFiles) {
      const relFile = relative(bundleDir, absFile);
      const hits = scanFile(absFile);
      if (hits.length > 0) {
        allHits.push({
          package: 'bundle',
          file: relFile,
          hits,
        });
      }
    }
  }

  // 报告
  if (allHits.length === 0) {
    console.log('\n  ✅ HARD GATE PASSED — 产物中未发现禁词\n');
    return { passed: true, hits: [] };
  }

  console.log(`\n  ❌ HARD GATE FAILED — ${allHits.length} 个文件命中禁词:\n`);
  for (const entry of allHits) {
    console.log(`  📁 ${entry.package}/${entry.file}`);
    for (const hit of entry.hits) {
      console.log(`     L${hit.line}: [${hit.term}] ${hit.preview}`);
    }
  }
  console.log('');

  return { passed: false, hits: allHits };
}

// ─── Soft Gate: 源码扫描（警告级） ────────────────────────

function runSoftGate() {
  console.log('\n══════════════════════════════════════════════');
  console.log('  SOFT GATE — 源码禁词扫描（warning）');
  console.log('══════════════════════════════════════════════\n');

  const scanDirs = [
    'packages/api/src',
    'packages/web/src',
    'packages/shared/src',
    'packages/mcp-server/src',
    'scripts',
    'cat-cafe-skills',
  ];

  const allHits = [];
  let scannedCount = 0;

  for (const dir of scanDirs) {
    const absDir = join(PROJECT_ROOT, dir);
    if (!existsSync(absDir)) continue;

    const files = collectFiles(absDir, SOFT_GATE_EXTENSIONS);
    for (const absFile of files) {
      const relPath = relative(PROJECT_ROOT, absFile);

      // 白名单排除
      if (isWhitelisted(relPath)) continue;

      scannedCount++;
      const hits = scanFile(absFile);
      if (hits.length > 0) {
        allHits.push({
          file: relPath,
          hits,
        });
      }
    }
  }

  // 报告
  console.log(`  扫描文件数: ${scannedCount}`);

  if (allHits.length === 0) {
    console.log('  ✅ SOFT GATE CLEAN — 源码中未发现禁词\n');
    return { warnings: 0, hits: [] };
  }

  console.log(`  ⚠️  SOFT GATE — ${allHits.length} 个文件命中禁词（warning，不阻断）:\n`);
  for (const entry of allHits) {
    console.log(`  📁 ${entry.file} (${entry.hits.length} hits)`);
    // 只打前 3 条预览
    for (const hit of entry.hits.slice(0, 3)) {
      console.log(`     L${hit.line}: [${hit.term}] ${hit.preview}`);
    }
    if (entry.hits.length > 3) {
      console.log(`     ... +${entry.hits.length - 3} more`);
    }
  }
  console.log('');

  return {
    warnings: allHits.reduce((sum, e) => sum + e.hits.length, 0),
    hits: allHits,
  };
}

// ─── 汇总报告 ─────────────────────────────────────────

function printSummary(hardResult, softResult) {
  console.log('══════════════════════════════════════════════');
  console.log('  PUBLIC ARTIFACT GATE — 汇总');
  console.log('══════════════════════════════════════════════');
  console.log(`  Hard gate: ${hardResult.passed ? '✅ PASS' : '❌ FAIL'}`);
  if (softResult) {
    console.log(`  Soft gate: ${softResult.warnings === 0 ? '✅ CLEAN' : `⚠️  ${softResult.warnings} warnings`}`);
  }
  console.log('══════════════════════════════════════════════\n');
}

// ─── Main ─────────────────────────────────────────────

const args = process.argv.slice(2);
const hardOnly = args.includes('--hard-only');
const softOnly = args.includes('--soft-only');
const jsonOutput = args.includes('--json');

// JSON 模式下抑制 visual 输出
const _log = console.log;
if (jsonOutput) {
  console.log = () => {};
}

let hardResult = { passed: true, hits: [] };
let softResult = null;

if (!softOnly) {
  hardResult = runHardGate();
}

if (!hardOnly) {
  softResult = runSoftGate();
}

// 恢复 console.log
console.log = _log;

if (jsonOutput) {
  console.log(JSON.stringify({
    hardGate: hardResult,
    softGate: softResult,
    timestamp: new Date().toISOString(),
  }, null, 2));
} else {
  printSummary(hardResult, softResult);
}

// Hard gate 失败 → exit 1（CI 阻断）
if (!hardResult.passed) {
  process.exit(1);
}
