/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProfile } from '../UserProfile';

const mockReplace = vi.fn();
const mockSetTheme = vi.fn();
const mockWindowOpen = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'business', setTheme: mockSetTheme }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => 'user:Alice',
  getIsSkipAuth: () => false,
}));

vi.mock('../VersionUpdateModal', () => ({
  default: () => null,
}));

const usageStatsModalSpy = vi.fn();

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
    mockReplace.mockReset();
    mockSetTheme.mockReset();
    mockWindowOpen.mockReset();
    usageStatsModalSpy.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
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

  it('opens the theme popover on click instead of hover', async () => {
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

  it('opens the help document when the help action is clicked', async () => {
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
    expect(helpButton).toBeTruthy();

    act(() => {
      helpButton?.click();
    });

    expect(mockWindowOpen).toHaveBeenCalledWith(
      'https://support.huaweicloud.com/officeclaw-agentarts-pc/officeclaw-agentarts-pc-0001.html',
      '_blank',
      'noopener,noreferrer',
    );
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
 	     expect(usageStatsModalSpy).toHaveBeenLastCalledWith(
 	       expect.objectContaining({
 	         open: false,
 	         onClose: expect.any(Function),
 	       }),
 	     );
 	 
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
