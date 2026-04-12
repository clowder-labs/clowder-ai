/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import type { Metadata, Viewport } from 'next';
import { AppAuthBootstrap } from '@/components/AppAuthBootstrap';
import { ThemeRootSync } from '@/components/ThemeRootSync';
import { ToastContainer } from '@/components/ToastContainer';
import { ConfirmProvider } from '@/components/useConfirm';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#E29578',
};

export const metadata: Metadata = {
  title: 'OfficeClaw',
  description: 'Your AI team collaboration space',
  manifest: '/manifest.json',
  icons: {
    icon: '/images/lobster.svg',
    apple: '/images/lobster.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'OfficeClaw',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-ui-theme="business">
      <body className="min-h-screen w-screen">
        <ThemeRootSync />
        <AppAuthBootstrap>
          <ConfirmProvider>{children}</ConfirmProvider>
        </AppAuthBootstrap>
        <ToastContainer />
      </body>
    </html>
  );
}
