import esbuild from 'esbuild';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlToPptxDir = path.join(__dirname, '..');
const outDir = path.join(htmlToPptxDir, 'dist');
// pptx-craft 根目录的 node_modules（依赖统一安装在那里）
const rootNodeModules = path.join(__dirname, '../../node_modules');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 构建主 bundle（dom-to-pptx）
esbuild.build({
  entryPoints: [path.join(htmlToPptxDir, 'src', 'index.js')],
  bundle: true,
  outfile: path.join(outDir, 'dom-to-pptx.bundle.js'),
  format: 'iife',
  globalName: 'domToPptx',
  platform: 'browser',
  nodePaths: [rootNodeModules],
  target: ['es2020'],
  minify: false,  // 暂时关闭压缩以便调试
  keepNames: true,  // 保留函数名称
  sourcemap: false,  // 关闭 source map 以避免 Vite 警告
  external: [
    'fonteditor-core',  // 外部依赖
    'fs', 'path', 'os', 'crypto',  // Node.js 内置模块
    'sharp', 'jsdom', 'canvas'  // Node.js 专用依赖
  ],
  loader: {
    '.js': 'js',
    '.ts': 'ts',  // 添加 TypeScript 支持
    '.wasm': 'binary',
  },
  footer: {
    js: `
// 导出到 window 对象
window.domToPptx = domToPptx;
`
  },
})
  .then(() => {
    console.log('✅ dom-to-pptx.bundle.js (IIFE) 构建完成');
  })
  .catch((err) => {
    console.error('❌ 构建失败:', err);
    process.exit(1);
  });

// 构建 ESM 版本（用于 Vite 应用）
esbuild.build({
  entryPoints: [path.join(htmlToPptxDir, 'src', 'index.js')],
  bundle: true,
  outfile: path.join(outDir, 'dom-to-pptx.esm.js'),
  format: 'esm',
  platform: 'browser',
  nodePaths: [rootNodeModules],
  target: ['es2020'],
  minify: false,
  keepNames: true,
  sourcemap: false,  // 关闭 source map 以避免 Vite 警告
  external: [
    'fonteditor-core',
    'fs', 'path', 'os', 'crypto',
    'sharp', 'jsdom', 'canvas'
  ],
  loader: {
    '.js': 'js',
    '.ts': 'ts',
    '.wasm': 'binary',
  },
  banner: {
    js: `
// Node.js 模块的浏览器端 shim（这些模块在浏览器环境中不会被使用）
const _requireShim = (id) => {
  if (id.includes('platform/node')) return { createNodePlatform: () => ({}) };
  throw new Error('Node.js module "' + id + '" is not available in browser');
};
if (typeof require === 'undefined') { window.require = _requireShim; }
`
  },
})
  .then(() => {
    console.log('✅ dom-to-pptx.esm.js (ESM) 构建完成');
  })
  .catch((err) => {
    console.error('❌ ESM 构建失败:', err);
    process.exit(1);
  });
