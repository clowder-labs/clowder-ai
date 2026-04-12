import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchUsageStatsPage } from '../usageStats';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('@/utils/api-client', () => ({
  apiFetch: (...args: unknown[]) => mocks.apiFetch(...args),
}));

describe('usageStats service', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset();
  });

  it('fetches threads and sessions, then filters and paginates by range on the frontend', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    const threadOneSessions = [
      {
        id: 'session-1',
        updatedAt: 1_699_999_999_000,
        lastUsage: {
          inputTokens: 45_000,
          outputTokens: 12_000,
          cacheReadTokens: 30_000,
          costUsd: 0.42,
        },
      },
    ];
    const threadTwoSessions = [
      {
        id: 'session-2-old',
        updatedAt: 1_699_700_000_000,
        lastUsage: {
          inputTokens: 11_000,
        },
      },
      {
        id: 'session-2-new',
        updatedAt: 1_699_999_998_000,
        lastUsage: {
          outputTokens: 4_000,
        },
      },
    ];
    const threadThreeSessions = [
      {
        id: 'session-3',
        updatedAt: 1_699_000_000_000,
        lastUsage: {
          inputTokens: 999,
          outputTokens: 1,
        },
      },
    ];

    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [
          { id: 'thread-1', title: '' },
          { id: 'thread-2', title: '你好' },
          { id: 'thread-3', title: 'too old' },
        ],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => threadOneSessions,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => threadTwoSessions,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => threadThreeSessions,
      });

    const result = await fetchUsageStatsPage({ page: 1, pageSize: 1, range: 'today' });

    expect(mocks.apiFetch).toHaveBeenNthCalledWith(1, '/api/threads');
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(2, '/api/threads/thread-1/sessions');
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(3, '/api/threads/thread-2/sessions');
    expect(mocks.apiFetch).toHaveBeenNthCalledWith(4, '/api/threads/thread-3/sessions');
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: 'thread-1',
      sessionName: '未命名对话',
      totalTokensUsed: 57_000,
      inputTokensUsed: 45_000,
      outputTokensUsed: 12_000,
    });
  });

  it('sums input and output tokens across all sessions inside the selected range', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          threads: [{ id: 'thread-1', title: 'A' }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [
            {
              id: 's1',
              updatedAt: 1_699_999_990_000,
              lastUsage: { inputTokens: 10_000, outputTokens: 2_000 },
            },
            {
              id: 's2',
              updatedAt: 1_699_999_999_000,
              lastUsage: { inputTokens: 20_000, outputTokens: 3_000 },
            },
            {
              id: 's3',
              updatedAt: 1_699_800_000_000,
              lastUsage: { inputTokens: 99_999, outputTokens: 99_999 },
            },
          ],
        }),
      });

    const result = await fetchUsageStatsPage({ page: 1, pageSize: 6, range: 'today' });

    expect(result.items[0]).toMatchObject({
      id: 'thread-1',
      inputTokensUsed: 30_000,
      outputTokensUsed: 5_000,
      totalTokensUsed: 35_000,
    });
  });

  it('sorts by the latest session updatedAt inside the selected range', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    mocks.apiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          threads: [
            { id: 'thread-1', title: 'A' },
            { id: 'thread-2', title: 'B' },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [{ id: 's1', updatedAt: 1_699_999_990_000 }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessions: [{ id: 's2', updatedAt: 1_699_999_999_000 }],
        }),
      });

    const result = await fetchUsageStatsPage({ page: 1, pageSize: 6, range: 'today' });

    expect(result.items.map((item) => item.id)).toEqual(['thread-2', 'thread-1']);
  });

  it('throws the api error message when the thread request fails', async () => {
    mocks.apiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'threads failed' }),
    });

    await expect(fetchUsageStatsPage({ page: 1, pageSize: 6, range: 'today' })).rejects.toThrow('threads failed');
  });
});
