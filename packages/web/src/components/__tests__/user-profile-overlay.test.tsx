/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProfile } from '../UserProfile';
import { apiFetch } from '@/utils/api-client';
import { clearAuthIdentity } from '@/utils/userId';

const mockReplace = vi.fn();
const mockSetTheme = vi.fn();
const mockWindowOpen = vi.fn();
const mockLocationAssign = vi.fn();
const originalLocation = window.location;
let currentTheme: 'business' | 'warm' | 'dark' = 'business';
let currentUserId = 'user:Alice';
let currentUserName = 'Alice';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: currentTheme, setTheme: mockSetTheme }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => currentUserId,
  getUserName: () => currentUserName,
  getIsSkipAuth: () => false,
  clearAuthIdentity: vi.fn(),
}));

vi.mock('../VersionUpdateModal', () => ({
  default: () => null,
}));

const usageStatsModalSpy = vi.fn();
const mockApiFetch = vi.mocked(apiFetch);
const mockClearAuthIdentity = vi.mocked(clearAuthIdentity);

vi.mock('../UsageStatsModal', () => ({
  UsageStatsModal: (props: { open: boolean; onClose: () => void }) => {
    usageStatsModalSpy(props);
    return props.open ? React.createElement('div', { 'data-testid': 'usage-stats-modal' }) : null;
  },
}));

describe('UserProfile overlay classes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, 'open', {
      configurable: true,
      writable: true,
      value: mockWindowOpen,
    });
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    currentTheme = 'business';
    mockReplace.mockReset();
    mockSetTheme.mockReset();
    mockWindowOpen.mockReset();
    mockLocationAssign.mockReset();
    mockApiFetch.mockReset();
    mockClearAuthIdentity.mockReset();
    usageStatsModalSpy.mockReset();

    mockApiFetch.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) } as Response);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        assign: mockLocationAssign,
      },
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('renders a stable fallback name on the server before browser user state loads', async () => {
    currentUserId = 'default-user';
    currentUserName = '';
    expect(renderToString(React.createElement(UserProfile))).toContain('未登录');

    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    expect(container.textContent).toContain('未登录');
  });

  it('opens the theme popover on click instead of hover', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    const toggleAvatar = toggle?.querySelector('div.rounded-full');
    const toggleName = toggle?.querySelector('div[title]');
    expect(toggle).toBeTruthy();
    expect(toggle?.className).toContain('text-[var(--text-primary)]');
    expect(toggleAvatar?.className).toContain('bg-[var(--surface-avatar-shell)]');
    expect(toggleName?.className).toContain('text-[var(--text-primary)]');

    act(() => {
      toggle?.click();
    });
    await flush();

    const panel = container.querySelector('[data-testid="user-profile-panel"]');
    const themeTrigger = container.querySelector('[data-testid="user-profile-theme-trigger"]');
    const themeTriggerLabel = themeTrigger?.querySelector('span');
    const initialThemeArrow = container.querySelector('[data-testid="user-profile-theme-arrow"]');
    const logoutButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('退出登录'));

    expect(panel).toBeTruthy();
    expect(panel?.className).toContain('ui-overlay-card');
    expect(themeTrigger).toBeTruthy();
    expect(themeTrigger?.className).toContain('ui-overlay-item');
    expect(themeTrigger?.className).toContain('gap-2');
    expect(themeTriggerLabel?.className).toContain('text-left');
    expect(initialThemeArrow).toBeTruthy();
    expect(logoutButton).toBeTruthy();
    expect(logoutButton?.className).toContain('ui-button-default');

    const themeAnchor = container.querySelector('[data-testid="user-profile-theme-anchor"]') as HTMLDivElement | null;
    expect(themeAnchor).toBeTruthy();

    const rootElement = container.firstElementChild as HTMLElement | null;
    expect(rootElement).toBeTruthy();

    Object.defineProperty(rootElement!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 20,
        top: 100,
        right: 220,
        bottom: 300,
        width: 200,
        height: 200,
        x: 20,
        y: 100,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(themeAnchor!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 32,
        top: 180,
        right: 204,
        bottom: 220,
        width: 172,
        height: 40,
        x: 32,
        y: 180,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(panel!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 32,
        top: 116,
        right: 208,
        bottom: 296,
        width: 176,
        height: 180,
        x: 32,
        y: 116,
        toJSON: () => ({}),
      }),
    });

    act(() => {
      themeTrigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    await flush();
    expect(container.querySelector('[data-testid="user-theme-popover"]')).toBeNull();

    act(() => {
      themeTrigger?.click();
    });
    await flush();

    const themePopover = container.querySelector('[data-testid="user-theme-popover"]');
    const themeOptions = container.querySelector('[data-testid="user-theme-options"]');
    const activeThemeOption = container.querySelector('[data-testid="user-theme-option-business"]');
    const activeThemeLabel = activeThemeOption?.querySelector('span');
    const themeArrow = container.querySelector('[data-testid="user-profile-theme-arrow"]');

    expect(themePopover).toBeTruthy();
    expect(themePopover?.className).toContain('ui-overlay-card');
    expect(themePopover?.className).toContain('rounded-[var(--radius-md)]');
    expect(themePopover?.className).toContain('shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)]');
    expect(themePopover?.className).not.toContain('left-[calc(100%-12px)]');
    expect(themePopover?.className).not.toContain('-translate-y-1/2');
    expect((themePopover as HTMLDivElement | null)?.style.left).toBe('188px');
    expect((themePopover as HTMLDivElement | null)?.style.top).toBe('80px');
    expect(themeOptions?.className).toContain('gap-4');
    expect(themeOptions?.className).not.toContain('justify-between');
    expect(activeThemeOption).toBeTruthy();
    expect(activeThemeOption?.className).toContain('ui-overlay-item');
    expect(activeThemeOption?.className).toContain('hover:bg-transparent');
    expect(activeThemeOption?.className).toContain('focus-visible:bg-transparent');
    expect(activeThemeLabel?.className).toContain('whitespace-nowrap');
    expect(themeArrow).toBeTruthy();

    act(() => {
      themeTrigger?.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="user-theme-popover"]')).toBeNull();
    expect(container.querySelector('[data-testid="user-profile-theme-arrow"]')).toBeTruthy();
  });

  it('uses the warm selected badge color for the orange-white theme option', async () => {
    currentTheme = 'warm';

    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    const panel = container.querySelector('[data-testid="user-profile-panel"]') as HTMLDivElement | null;
    const themeAnchor = container.querySelector('[data-testid="user-profile-theme-anchor"]') as HTMLDivElement | null;
    const themeTrigger = container.querySelector('[data-testid="user-profile-theme-trigger"]') as HTMLButtonElement | null;
    const rootElement = container.firstElementChild as HTMLElement | null;

    expect(panel).toBeTruthy();
    expect(themeAnchor).toBeTruthy();
    expect(themeTrigger).toBeTruthy();
    expect(rootElement).toBeTruthy();

    Object.defineProperty(rootElement!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 20,
        top: 100,
        right: 220,
        bottom: 300,
        width: 200,
        height: 200,
        x: 20,
        y: 100,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(themeAnchor!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 32,
        top: 180,
        right: 204,
        bottom: 220,
        width: 172,
        height: 40,
        x: 32,
        y: 180,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(panel!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 32,
        top: 116,
        right: 208,
        bottom: 296,
        width: 176,
        height: 180,
        x: 32,
        y: 116,
        toJSON: () => ({}),
      }),
    });

    act(() => {
      themeTrigger?.click();
    });
    await flush();

    const warmBadge = container.querySelector('[data-testid="user-theme-selected-badge-warm"]') as HTMLDivElement | null;
    expect(warmBadge).toBeTruthy();
    expect(warmBadge?.style.backgroundColor).toBe('rgb(204, 109, 26)');
  });

  it('supports selecting the dark theme from the theme popover', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    const panel = container.querySelector('[data-testid="user-profile-panel"]') as HTMLDivElement | null;
    const themeAnchor = container.querySelector('[data-testid="user-profile-theme-anchor"]') as HTMLDivElement | null;
    const themeTrigger = container.querySelector('[data-testid="user-profile-theme-trigger"]') as HTMLButtonElement | null;
    const rootElement = container.firstElementChild as HTMLElement | null;

    expect(panel).toBeTruthy();
    expect(themeAnchor).toBeTruthy();
    expect(themeTrigger).toBeTruthy();
    expect(rootElement).toBeTruthy();

    Object.defineProperty(rootElement!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 20,
        top: 100,
        right: 220,
        bottom: 300,
        width: 200,
        height: 200,
        x: 20,
        y: 100,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(themeAnchor!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 32,
        top: 180,
        right: 204,
        bottom: 220,
        width: 172,
        height: 40,
        x: 32,
        y: 180,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(panel!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 32,
        top: 116,
        right: 208,
        bottom: 296,
        width: 176,
        height: 180,
        x: 32,
        y: 116,
        toJSON: () => ({}),
      }),
    });

    act(() => {
      themeTrigger?.click();
    });
    await flush();

    const darkThemeOption = container.querySelector('[data-testid="user-theme-option-dark"]') as HTMLButtonElement | null;
    expect(darkThemeOption).toBeTruthy();
    expect(darkThemeOption?.textContent).toContain('暗黑');

    act(() => {
      darkThemeOption?.click();
    });
    await flush();

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
    expect(container.querySelector('[data-testid="user-theme-popover"]')).toBeNull();
  });

  it('opens the about popover and reuses the help action inside it', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    const helpButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('帮助'));
    expect(Array.from(container.querySelectorAll('button')).some((button) => button.textContent?.trim() === '帮助')).toBe(false);

    act(() => {
      (container.querySelector('[data-testid="user-profile-about-trigger"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="user-about-popover"]')).toBeTruthy();

    act(() => {
      (container.querySelector('[data-testid="user-about-help-action"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://support.huaweicloud.com/officeclaw-agentarts-pc/officeclaw-agentarts-pc-0001.html',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('opens the privacy declaration from the about popover in a new tab', async () => {
    currentUserId = 'user:Alice';
    currentUserName = 'Alice';
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    act(() => {
      (container.querySelector('[data-testid="user-profile-about-trigger"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="user-about-popover"]')).toBeTruthy();

    act(() => {
      (container.querySelector('[data-testid="user-about-privacy-action"]') as HTMLButtonElement | null)?.click();
    });
    await flush();

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://www.huaweicloud.com/declaration/sa_prp.html',
      '_blank',
      'noopener,noreferrer',
    );
  });

  it('falls back to the default logout url when the logout request fails', async () => {
    mockApiFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    const logoutButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('退出登录'));
    expect(logoutButton).toBeTruthy();

    await act(async () => {
      logoutButton?.click();
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(mockClearAuthIdentity).toHaveBeenCalledTimes(1);
    expect(mockLocationAssign).toHaveBeenCalledWith(
      'https://auth.huaweicloud.com/authui/login.html?service=https://auth.huaweicloud.com/authui/v1/oauth2/authorize?',
    );
  });

  it('shows security management before version update and keeps the panel open on click', async () => {
    act(() => {
      root.render(React.createElement(UserProfile));
    });
    await flush();

    const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
    expect(toggle).toBeTruthy();

    act(() => {
      toggle?.click();
    });
    await flush();

    const actions = container.querySelector('[data-testid="user-profile-content-actions"]');
    expect(actions).toBeTruthy();

    const actionButtons = actions ? Array.from(actions.querySelectorAll('button')) : [];
    const securityButton = actionButtons.find((button) => button.textContent?.includes('安全管理'));
    const versionButton = actionButtons.find((button) => button.textContent?.includes('版本更新'));

    expect(securityButton).toBeTruthy();
    expect(versionButton).toBeTruthy();
    expect(actionButtons.indexOf(securityButton as HTMLButtonElement)).toBeLessThan(
      actionButtons.indexOf(versionButton as HTMLButtonElement),
    );

    act(() => {
      securityButton?.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="user-profile-panel"]')).toBeNull();
    expect(mockWindowOpen).not.toHaveBeenCalled();
  });

   it('shows usage stats above version update and opens the usage modal', async () => {
 	     act(() => {
 	       root.render(React.createElement(UserProfile));
 	     });
 	     await flush();
 	 
 	     const toggle = container.querySelector('[data-testid="user-profile-toggle"]') as HTMLButtonElement | null;
 	     expect(toggle).toBeTruthy();
 	 
 	     act(() => {
 	       toggle?.click();
 	     });
 	     await flush();
 	 
 	     const actions = container.querySelector('[data-testid="user-profile-content-actions"]');
 	     expect(actions).toBeTruthy();
 	 
 	     const actionButtons = actions ? Array.from(actions.querySelectorAll('button')) : [];
 	     const usageButton = actionButtons.find((button) => button.textContent?.includes('用量统计'));
 	     const versionButton = actionButtons.find((button) => button.textContent?.includes('版本更新'));
 	 
 	     expect(usageButton).toBeTruthy();
 	     expect(versionButton).toBeTruthy();
 	     expect(actionButtons.indexOf(usageButton as HTMLButtonElement)).toBeLessThan(
 	       actionButtons.indexOf(versionButton as HTMLButtonElement),
 	     );
 	     expect(usageStatsModalSpy).not.toHaveBeenCalled();
 	 
 	     act(() => {
 	       usageButton?.click();
 	     });
 	     await flush();
 	 
 	     expect(container.querySelector('[data-testid="usage-stats-modal"]')).toBeTruthy();
 	     expect(usageStatsModalSpy).toHaveBeenLastCalledWith(
 	       expect.objectContaining({
 	         open: true,
 	         onClose: expect.any(Function),
 	       }),
 	     );
 	   });
});
