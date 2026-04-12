#!/usr/bin/env node
/**
 * pptx-craft 环境检测脚本
 * 输出自然语言，供大模型直接理解
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(__dirname, '..');

// 检测 Node.js
function checkNode() {
  try {
    const v = execSync('node --version', { encoding: 'utf-8', timeout: 5000 }).trim();
    const major = parseInt(v.replace('v', '').split('.')[0]);
    return { ok: major >= 18, version: v };
  } catch {
    return { ok: false, version: null };
  }
}

// 检测 node_modules
function checkNodeModules() {
  const nm = path.join(skillRoot, 'node_modules');
  return { ok: fs.existsSync(nm) };
}

// 检测 Chromium
function checkChromium() {
  const caches = [
    process.env.LOCALAPPDATA + '\\ms-playwright',
    (process.env.HOME || '') + '/.cache/ms-playwright',
    (process.env.HOME || '') + '/Library/Caches/ms-playwright'
  ].filter(Boolean);
  
  for (const c of caches) {
    if (fs.existsSync(c)) {
      const entries = fs.readdirSync(c);
      if (entries.some(e => e.startsWith('chromium-'))) return { ok: true };
    }
  }
  return { ok: false };
}

// 主输出
function main() {
  const node = checkNode();
  const nodeModules = checkNodeModules();
  const chromium = checkChromium();
  
  const lines = [];
  
  if (!node.ok) {
    lines.push(`❌ Node.js 未安装或版本过低（需要 >=18）`);
    lines.push(`   → 安装: https://nodejs.org`);
  } else {
    lines.push(`✅ Node.js ${node.version}`);
  }
  
  if (!nodeModules.ok) {
    lines.push(`❌ 依赖未安装`);
    lines.push(`   → 安装: cd ${skillRoot} && npm install`);
  } else {
    lines.push(`✅ npm 依赖已安装`);
  }
  
  if (!chromium.ok) {
    lines.push(`❌ Chromium 浏览器未安装`);
    if (nodeModules.ok) {
      // node_modules 存在，只需要安装浏览器
      lines.push(`   → 安装(Windows): npx playwright install chromium`);
      lines.push(`   → 安装(Linux/Mac): npx playwright install chromium`);
    } else {
      // node_modules 不存在，npm install 后需要单独安装浏览器
      lines.push(`   → npm install 后需执行: npx playwright install chromium`);
    }
  } else {
    lines.push(`✅ Chromium 已安装`);
  }
  
  const allOk = node.ok && nodeModules.ok && chromium.ok;
  lines.push('');
  if (allOk) {
    lines.push(`✅ 环境就绪，可以开始制作 PPT`);
  } else {
    lines.push(`⚠️ 环境未就绪，请按上述 → 提示安装`);
  }
  
  console.log(lines.join('\n'));
}

main();