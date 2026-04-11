import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatPaginationPages, UsageStatsModal } from '../UsageStatsModal';

describe('UsageStatsModal', () => {
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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  async function flush(ms = 0) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, ms));
    });
  }

  it('shows two pages around current page and preserves the first two and last two pages', () => {
    expect(formatPaginationPages(4, 8)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(formatPaginationPages(1, 10)).toEqual([1, 2, 3, 'ellipsis', 9, 10]);
    expect(formatPaginationPages(5, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 'ellipsis', 9, 10]);
    expect(formatPaginationPages(10, 10)).toEqual([1, 2, 'ellipsis', 8, 9, 10]);
  });

  it('renders the session, input token, output token, total token, and time columns', async () => {
    const fetchPage = vi.fn(async () => ({
      items: [
        {
          id: 'row-1',
          sessionName: 'session-1',
          totalTokensUsed: 12345,
          inputTokensUsed: 2345,
          outputTokensUsed: null,
          occurredAt: '2026-03-23 10:00:00',
        },
      ],
      page: 1,
      pageSize: 6,
      total: 1,
    }));

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchPage }));
    });
    await flush(320);

    const rows = container.querySelectorAll('[data-testid^="usage-stats-row-"]');
    const cells = rows[0]?.querySelectorAll('td') ?? [];
    const sessionCell = cells[0];
    const inputTokenCell = cells[1];
    const outputTokenCell = cells[2];
    const totalTokenCell = cells[3];
    const timeCell = cells[4];

    expect(rows).toHaveLength(1);
    expect(cells).toHaveLength(5);
    expect(sessionCell?.className).toContain('h-16');
    expect(container.textContent).toContain('session-1');
    expect(inputTokenCell?.textContent).toBe('2.3k');
    expect(outputTokenCell?.textContent).toBe('');
    expect(totalTokenCell?.textContent).toBe('12.3k');
    expect(totalTokenCell?.getAttribute('title')).toBe('12,345');
    expect(timeCell?.className).toContain('text-[12px]');
  });

  it('shows a loading overlay over the table body while keeping existing rows visible', async () => {
    let resolveNext: (() => void) | null = null;
    const fetchPage = vi
      .fn<({ page }: { page: number }) => Promise<{ items: Array<Record<string, unknown>>; page: number; pageSize: number; total: number }>>()
      .mockImplementationOnce(async () => ({
        items: [
          {
            id: 'row-1',
            sessionName: 'session-1',
            totalTokensUsed: 100,
            inputTokensUsed: null,
            outputTokensUsed: null,
            occurredAt: '2026-03-23 10:00:00',
          },
        ],
        page: 1,
        pageSize: 6,
        total: 7,
      }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNext = () =>
              resolve({
                items: [
                  {
                    id: 'row-2',
                    sessionName: 'session-2',
                    totalTokensUsed: 200,
                    inputTokensUsed: null,
                    outputTokensUsed: null,
                    occurredAt: '2026-03-23 10:01:00',
                  },
                ],
                page: 1,
                pageSize: 6,
                total: 7,
              });
          }),
      );

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchPage }));
    });
    await flush(320);

    expect(container.textContent).toContain('session-1');

    const refreshButton = container.querySelector('[data-testid="usage-stats-refresh"]') as HTMLButtonElement | null;
    act(() => {
      refreshButton?.click();
    });

    expect(container.textContent).toContain('session-1');
    expect(container.querySelector('[data-testid="usage-stats-loading-overlay"]')).toBeTruthy();

    act(() => {
      resolveNext?.();
    });
    await flush(320);

    expect(container.querySelector('[data-testid="usage-stats-loading-overlay"]')).toBeNull();
    expect(container.textContent).toContain('session-2');
  });

  it('switches the active page immediately before the next page request resolves', async () => {
    let resolvePageTwo: (() => void) | null = null;
    const fetchPage = vi
      .fn()
      .mockImplementationOnce(async () => ({
        items: [
          {
            id: 'row-1',
            sessionName: 'session-1',
            totalTokensUsed: 100,
            inputTokensUsed: null,
            outputTokensUsed: null,
            occurredAt: '2026-03-23 10:00:00',
          },
        ],
        page: 1,
        pageSize: 6,
        total: 13,
      }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolvePageTwo = () =>
              resolve({
                items: [
                  {
                    id: 'row-2',
                    sessionName: 'session-2',
                    totalTokensUsed: 200,
                    inputTokensUsed: null,
                    outputTokensUsed: null,
                    occurredAt: '2026-03-23 10:01:00',
                  },
                ],
                page: 2,
                pageSize: 6,
                total: 13,
              });
          }),
      );

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchPage }));
    });
    await flush(320);

    const pageTwoButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '2');
    expect(pageTwoButton).toBeTruthy();

    act(() => {
      pageTwoButton?.click();
    });

    expect(fetchPage).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, pageSize: 6, range: '7d' }));
    expect(pageTwoButton?.className).toContain('bg-[#F5F5F5]');

    act(() => {
      resolvePageTwo?.();
    });
    await flush(320);

    expect(container.textContent).toContain('session-2');
  });

  it('clears the table and shows empty state when page three fails', async () => {
    const fetchPage = vi.fn(async ({ page }: { page: number }) => {
      if (page === 3) {
        throw new Error('page 3 failed');
      }

      return {
        items: [
          {
            id: `row-${page}`,
            sessionName: `session-${page}`,
            totalTokensUsed: 100 * page,
            inputTokensUsed: null,
            outputTokensUsed: null,
            occurredAt: '2026-03-23 10:00:00',
          },
        ],
        page,
        pageSize: 6,
        total: 13,
      };
    });

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchPage }));
    });
    await flush(320);

    const pageThreeButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '3');
    expect(pageThreeButton).toBeTruthy();

    act(() => {
      pageThreeButton?.click();
    });
    await flush(320);

    expect(container.querySelectorAll('[data-testid^="usage-stats-row-"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="usage-stats-loading-overlay"]')).toBeNull();
  });

  it('does not trigger refresh, paging, or range changes while a request is already in flight', async () => {
    let resolveRequest: (() => void) | null = null;
    const fetchPage = vi.fn(
      () =>
        new Promise<{ items: Array<Record<string, unknown>>; page: number; pageSize: number; total: number }>((resolve) => {
          resolveRequest = () =>
            resolve({
              items: [
                {
                  id: 'row-1',
                  sessionName: 'session-1',
                  totalTokensUsed: 100,
                  inputTokensUsed: null,
                  outputTokensUsed: null,
                  occurredAt: '2026-03-23 10:00:00',
                },
              ],
              page: 1,
              pageSize: 6,
              total: 13,
            });
        }),
    );

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchPage }));
    });

    await flush(320);

    const refreshButton = container.querySelector('[data-testid="usage-stats-refresh"]') as HTMLButtonElement | null;
    const rangeTrigger = container.querySelector('[data-testid="usage-stats-range-trigger"]') as HTMLButtonElement | null;
    const pageTwoButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === '2');

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(refreshButton?.disabled).toBe(true);
    expect(rangeTrigger?.disabled).toBe(true);
    expect(pageTwoButton?.getAttribute('disabled')).not.toBeNull();

    act(() => {
      refreshButton?.click();
      rangeTrigger?.click();
      pageTwoButton?.click();
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="usage-stats-range-menu"]')).toBeNull();

    act(() => {
      resolveRequest?.();
    });
    await flush(320);

    expect(refreshButton?.disabled).toBe(false);
    expect(rangeTrigger?.disabled).toBe(false);
  });

  it('uses 12px and #191919 for the visible range value and default dropdown options', async () => {
    const fetchPage = vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 6,
      total: 0,
    }));

    act(() => {
      root.render(React.createElement(UsageStatsModal, { open: true, onClose: vi.fn(), fetchPage }));
    });
    await flush(320);

    const rangeTrigger = container.querySelector('[data-testid="usage-stats-range-trigger"]') as HTMLButtonElement | null;
    expect(rangeTrigger?.className).toContain('text-[12px]');
    expect(rangeTrigger?.className).toContain('text-[#191919]');

    act(() => {
      rangeTrigger?.click();
    });

    const options = Array.from(container.querySelectorAll('[data-testid="usage-stats-range-menu"] button'));
    expect(options).toHaveLength(4);
    expect(options[0]?.className).toContain('hover:bg-[#F5F5F5]');

    const defaultOption = options.find((option) => option.textContent?.trim() === '今日');
    const selectedOption = options.find((option) => option.textContent?.trim() === '近7日');

    expect(defaultOption?.className).toContain('text-[12px]');
    expect(defaultOption?.className).toContain('text-[#191919]');
    expect(selectedOption?.className).toContain('text-[#1476FF]');

    const headerRow = container.querySelector('thead tr');
    expect(headerRow?.className).not.toContain('font-medium');
    const headerCells = container.querySelectorAll('thead th');
    const separators = container.querySelectorAll('thead th span[aria-hidden="true"]');
    expect(headerCells[0]?.className).toContain('relative');
    expect(headerCells[1]?.className).toContain('relative');
    expect(headerCells[2]?.className).toContain('relative');
    expect(headerCells[3]?.className).toContain('relative');
    expect(headerCells[4]?.className).not.toContain('relative');
    expect(separators).toHaveLength(4);
    expect(separators[0]?.className).toContain('h-4');
    expect(separators[0]?.className).toContain('w-px');
    expect(separators[0]?.className).toContain('top-1/2');
    expect(separators[0]?.className).toContain('bg-[#DBDBDB]');
  });
});
