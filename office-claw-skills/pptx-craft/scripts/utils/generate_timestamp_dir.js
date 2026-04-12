#!/usr/bin/env node
// 生成带序号的时间戳目录

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseDir = process.argv[2] || 'output';

// 参数校验
if (!baseDir || typeof baseDir !== 'string' || baseDir.trim() === '') {
  console.error('错误：输出目录路径不能为空');
  process.exit(1);
}

const now = new Date();
const timestampPrefix = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
  '_',
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0'),
  String(now.getSeconds()).padStart(2, '0')
].join('');

// 确保基础目录存在
try {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
} catch (err) {
  console.error(`错误：无法创建基础目录 - ${baseDir}`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

// 查找同前缀的目录序号
const MAX_SEQ = 1000;
let seq = 0;
while (fs.existsSync(path.join(baseDir, `${timestampPrefix}_${String(seq).padStart(3, '0')}`))) {
  if (seq >= MAX_SEQ) {
    console.error(`错误：同前缀目录数已达上限 (${MAX_SEQ})`);
    process.exit(1);
  }
  seq++;
}

const timestampDir = path.join(baseDir, `${timestampPrefix}_${String(seq).padStart(3, '0')}`);

try {
  fs.mkdirSync(timestampDir, { recursive: true });
} catch (err) {
  console.error(`错误：无法创建输出目录 - ${timestampDir}`);
  console.error(`  ${err.message}`);
  process.exit(1);
}

// 拷贝 assets 目录到输出目录的 pages/ 子目录
const assetsSrc = path.resolve(__dirname, '../assets');
const pagesDir = path.join(timestampDir, 'pages');
fs.mkdirSync(pagesDir, { recursive: true });
const assetsDest = path.join(pagesDir, 'assets');

let assetsCopyFailed = false;
if (fs.existsSync(assetsSrc)) {
  try {
    fs.cpSync(assetsSrc, assetsDest, { recursive: true });
    console.error(`[assets] 已拷贝到 ${path.relative(process.cwd(), assetsDest)}`);
  } catch (err) {
    console.error(`[assets] 拷贝失败: ${err.message}`);
    assetsCopyFailed = true;
  }
}

if (assetsCopyFailed) {
  process.exit(1);
}

console.log(timestampDir);
