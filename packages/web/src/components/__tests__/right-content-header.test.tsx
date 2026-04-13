/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RightContentHeader } from '../RightContentHeader';
import { apiFetch } from '@/utils/api-client';
import { getIsSkipAuth } from '@/utils/userId';

const addToast = vi.fn();

vi.mock('@/stores/toastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof addToast }) => unknown) =>
    selector({ addToast }),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/utils/userId', () => ({
  getUserId: () => 'user-1',
  getIsSkipAuth: vi.fn(() => false),
}));

describe('RightContentHeader feedback popover', () => {
  let container: HTMLDivElement;
  let root: Root;
  const mockedApiFetch = vi.mocked(apiFetch);
  const mockedGetIsSkipAuth = vi.mocked(getIsSkipAuth);

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockedApiFetch.mockReset();
    mockedGetIsSkipAuth.mockReset();
    mockedGetIsSkipAuth.mockReturnValue(false);
    mockedApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ latest_feedback_date: '' }),
    } as Response);
    addToast.mockReset();
    window.sessionStorage.clear();
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

  function getSmileButton() {
    return container.querySelector('.ui-content-header-action[aria-haspopup="dialog"]') as HTMLButtonElement | null;
  }

  it('closes the feedback popover when clicking outside the dialog', async () => {
    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    const smileButton = getSmileButton();
    expect(smileButton).toBeTruthy();

    act(() => {
      smileButton?.click();
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeTruthy();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await flush();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('skips the feedback date check when skip auth is enabled', async () => {
    mockedGetIsSkipAuth.mockReturnValue(true);

    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('uses auto height and computes the popover max height from the content frame', async () => {
    act(() => {
      root.render(
        React.createElement(
          'div',
          { 'data-testid': 'right-content-frame' },
          React.createElement(RightContentHeader),
        ),
      );
    });
    await flush();

    const frame = container.querySelector('[data-testid="right-content-frame"]') as HTMLDivElement | null;
    const smileButton = getSmileButton();

    expect(frame).toBeTruthy();
    expect(smileButton).toBeTruthy();

    Object.defineProperty(frame!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 1000,
        bottom: 700,
        width: 1000,
        height: 700,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }),
    });

    Object.defineProperty(smileButton!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 100,
        top: 80,
        right: 128,
        bottom: 120,
        width: 28,
        height: 40,
        x: 100,
        y: 80,
        toJSON: () => ({}),
      }),
    });

    act(() => {
      smileButton?.click();
    });
    await flush();
    await flush();

    const popover = container.querySelector('[role="dialog"]') as HTMLDivElement | null;
    const popoverContent = container.querySelector('.ui-content-header-feedback-popover-content') as HTMLDivElement | null;
    expect(popover).toBeTruthy();
    expect(popover?.style.height).toBe('auto');
    expect(popoverContent).toBeTruthy();
    expect(popoverContent?.style.maxHeight).toBe('536px');
  });

  it('uses shared input styles for the detail textarea and other issue input', async () => {
    act(() => {
      root.render(React.createElement('div', null, React.createElement(RightContentHeader)));
    });
    await flush();

    const smileButton = getSmileButton();
    expect(smileButton).toBeTruthy();

    act(() => {
      smileButton?.click();
    });
    await flush();

    const lowScoreButton = Array.from(container.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === '评分 6');
    expect(lowScoreButton).toBeTruthy();

    act(() => {
      lowScoreButton?.click();
    });
    await flush();

    const detailTextarea = container.querySelector('textarea') as HTMLTextAreaElement | null;
    expect(detailTextarea).toBeTruthy();
    expect(detailTextarea?.className).toContain('ui-textarea');
    expect(detailTextarea?.className).toContain('ui-content-header-feedback-detail-input');

    const otherIssueLabel = Array.from(container.querySelectorAll('label')).find((label) => label.textContent?.includes('其他问题'));
    const otherIssueCheckbox = otherIssueLabel?.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
    expect(otherIssueCheckbox).toBeTruthy();

    act(() => {
      otherIssueCheckbox?.click();
    });
    await flush();

    const otherIssueInput = container.querySelector('input[type="text"]') as HTMLInputElement | null;
    expect(otherIssueInput).toBeTruthy();
    expect(otherIssueInput?.className).toContain('ui-input');

    const actions = container.querySelector('.ui-content-header-feedback-low-score-actions') as HTMLDivElement | null;
    const actionButtons = actions ? Array.from(actions.querySelectorAll('button')) : [];
    const [cancelButton, submitButton] = actionButtons;
    expect(cancelButton).toBeTruthy();
    expect(cancelButton?.className).toContain('ui-button-default');
    expect(cancelButton?.className).toContain('ui-modal-action-button');
    expect(submitButton).toBeTruthy();
    expect(submitButton?.className).toContain('ui-button-primary');
    expect(submitButton?.className).toContain('ui-modal-action-button');
  });
});
