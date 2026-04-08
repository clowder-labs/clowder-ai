import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserProfile } from '../UserProfile';

const mockReplace = vi.fn();
const mockSetTheme = vi.fn();

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

describe('UserProfile overlay classes', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockReplace.mockReset();
    mockSetTheme.mockReset();
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

  it('uses shared overlay classes for panel and theme popover surfaces', async () => {
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
    const logoutButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('退出登录'));

    expect(panel).toBeTruthy();
    expect(panel?.className).toContain('ui-overlay-card');
    expect(themeTrigger).toBeTruthy();
    expect(themeTrigger?.className).toContain('ui-overlay-item');
    expect(logoutButton).toBeTruthy();
    expect(logoutButton?.className).toContain('ui-button-default');

    act(() => {
      (themeTrigger as HTMLButtonElement).click();
    });
    await flush();

    const themePopover = container.querySelector('[data-testid="user-theme-popover"]');
    const activeThemeOption = container.querySelector('[data-testid="user-theme-option-business"]');

    expect(themePopover).toBeTruthy();
    expect(themePopover?.className).toContain('ui-overlay-card');
    expect(activeThemeOption).toBeTruthy();
    expect(activeThemeOption?.className).toContain('ui-overlay-item');
  });
});
