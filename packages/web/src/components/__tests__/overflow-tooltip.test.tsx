import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OverflowTooltip } from '@/components/shared/OverflowTooltip';

describe('OverflowTooltip', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('uses the shared white tooltip surface, arrow, and capped width', async () => {
    await act(async () => {
      root.render(
        React.createElement(OverflowTooltip, {
          content: 'D:/workspace/projects/really/long/folder/path/name',
          className: 'w-full',
          children: React.createElement('span', { className: 'truncate' }, 'D:/workspace/projects/really/long/folder/path/name'),
        }),
      );
    });

    const trigger = container.querySelector('span');
    expect(trigger).not.toBeNull();
    Object.defineProperty(trigger!, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(trigger!, 'scrollWidth', { configurable: true, value: 320 });
    Object.defineProperty(trigger!, 'clientHeight', { configurable: true, value: 20 });
    Object.defineProperty(trigger!, 'scrollHeight', { configurable: true, value: 20 });

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip).not.toBeNull();
    expect(tooltip?.style.maxWidth).toBeTruthy();
    expect(tooltip?.dataset.placement).toBeTruthy();
    const bubble = tooltip?.firstElementChild as HTMLDivElement | null;
    expect(bubble?.className).toContain('bg-white');
    expect(bubble?.className).toContain('shadow-[0px_2px_12px_0px_rgba(0,0,0,0.16)]');
    expect(bubble?.className).toContain('break-all');
    expect(bubble?.className).not.toContain('break-words');
    expect(tooltip?.querySelector('[data-testid="overflow-tooltip-arrow"]')).not.toBeNull();
  });

  it('can be configured to show even when the trigger text is not overflowed', async () => {
    await act(async () => {
      root.render(
        React.createElement(OverflowTooltip, {
          content: 'D:/workspace/projects/clowder-ai',
          forceShow: true,
          children: React.createElement('span', { className: 'truncate' }, 'clowder-ai'),
        }),
      );
    });

    const trigger = container.querySelector('span');
    expect(trigger).not.toBeNull();
    Object.defineProperty(trigger!, 'clientWidth', { configurable: true, value: 120 });
    Object.defineProperty(trigger!, 'scrollWidth', { configurable: true, value: 80 });
    Object.defineProperty(trigger!, 'clientHeight', { configurable: true, value: 20 });
    Object.defineProperty(trigger!, 'scrollHeight', { configurable: true, value: 20 });

    await act(async () => {
      trigger?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const tooltip = document.body.querySelector('[role="tooltip"]') as HTMLDivElement | null;
    expect(tooltip?.textContent).toContain('D:/workspace/projects/clowder-ai');
  });
});
