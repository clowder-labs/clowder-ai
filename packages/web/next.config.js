/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

const withPWA = require('@ducanh2912/next-pwa').default;

const enablePwaInDev = process.env.ENABLE_PWA_IN_DEV === '1';

function resolveApiBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '');
  if (explicit) return explicit;

  const apiPort = Number(process.env.API_SERVER_PORT);
  if (Number.isInteger(apiPort) && apiPort > 0) {
    return `http://localhost:${apiPort}`;
  }

  const frontendPort = Number(process.env.FRONTEND_PORT);
  if (Number.isInteger(frontendPort) && frontendPort > 0) {
    return `http://localhost:${frontendPort + 1}`;
  }

  return 'http://localhost:3004';
}

const apiBaseUrl = resolveApiBaseUrl();

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Enable production optimizations: minification and obfuscation
  swcMinify: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // onnxruntime-web (≈220 MB wasm+js) is only used client-side via dynamic import
  // in useVadinterrupt.ts; exclude from server bundling to prevent OOM during build.
  experimental: {
    serverComponentsExternalPackages: ['onnxruntime-web', '@ricky0123/vad-web']
  },
  // 允许 Tailscale 网段设备访问 dev server 的 /_next/* 资源
  allowedDevOrigins: [process.env.ALLOWED_DEV_ORIGINS],
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${apiBaseUrl}/uploads/:path*`,
      },
    ];
  },
};

module.exports = withPWA({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development' && !enablePwaInDev,
  reloadOnOnline: true,
  // Start URL is a static shell; precache it so PWA cold-open does not block on network.
  dynamicStartUrl: false,
  // Keep default page/document runtime caching and only override what we need.
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      {
        // API calls: never cache — always fresh chat data
        urlPattern: /^https?:\/\/.*\/api\//,
        handler: 'NetworkOnly',
      },
      {
        // WebSocket upgrade requests: skip caching
        urlPattern: /^https?:\/\/.*\/socket\.io/,
        handler: 'NetworkOnly',
      },
      {
        // Static assets: cache for performance
        urlPattern: /\.(png|jpg|jpeg|svg|gif|ico|woff2?)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-assets',
          expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
        },
      },
    ],
  },
})(nextConfig);
