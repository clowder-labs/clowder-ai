/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

/**
 * F32-b Phase 4 R24 P2-2: Regression test — CatSelector group title must show
 * breed-level display name, not the first variant's displayName.
 *
 * When a variant overrides displayName, the group heading should still read
 * "Claude 家族" (from breedDisplayName), NOT "宪宪专用家族" (from variant displayName).
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CatData } from '@/hooks/useCatData';

// Build multi-variant data where first variant overrides displayName.
const ragdollVariants: CatData[] = [
  {
    id: 'opus-custom',
    displayName: '定制 Claude', // variant-level override, not the family name
    color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
    breedId: 'ragdoll',
    breedDisplayName: 'Claude', // ← breed-level name
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    avatar: '/avatars/opus.png',
    mentionPatterns: ['@opus-custom'],
    roleDescription: '',
    personality: '',
    variantLabel: 'Custom',
    isDefaultVariant: false,
    source: 'seed',
  },
  {
    id: 'opus',
    displayName: 'Claude',
    color: { primary: '#9B7EBD', secondary: '#E8DFF5' },
    breedId: 'ragdoll',
    breedDisplayName: 'Claude',
    provider: 'anthropic',
    defaultModel: 'claude-sonnet-4-5-20250929',
    avatar: '/avatars/opus.png',
    mentionPatterns: ['@opus'],
    roleDescription: '',
    personality: '',
    isDefaultVariant: true,
    source: 'seed',
  },
];

const breedMap = new Map<string, CatData[]>([['ragdoll', ragdollVariants]]);

vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: ragdollVariants,
    isLoading: false,
    getCatById: (id: string) => ragdollVariants.find((c) => c.id === id),
    getCatsByBreed: () => breedMap,
  }),
  formatCatName: (cat: { displayName: string; variantLabel?: string }) =>
    cat.variantLabel ? `${cat.displayName}（${cat.variantLabel}）` : cat.displayName,
}));

describe('CatSelector breed group title (R24 P2-2)', () => {
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

  it('shows breedDisplayName in group title, not variant displayName', async () => {
    const { CatSelector } = await import('../CatSelector');
    const onChange = vi.fn();

    act(() => {
      root.render(React.createElement(CatSelector, { selectedCats: [], onSelectionChange: onChange }));
    });

     // Group title text should contain the family name, not the first variant override.
    const groupTitle = container.querySelector('.text-\\[10px\\]');
    expect(groupTitle).toBeTruthy();
    expect(groupTitle?.textContent).toContain('Claude 家族');
    expect(groupTitle?.textContent).not.toContain('定制 Claude家族');
  });

  it('renders all variant chips within the breed group', async () => {
    const { CatSelector } = await import('../CatSelector');
    const onChange = vi.fn();

    act(() => {
      root.render(React.createElement(CatSelector, { selectedCats: [], onSelectionChange: onChange }));
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    // Should have 2 variant chips.
    const chipTexts = buttons.map((b) => b.textContent);
    expect(chipTexts.some((t) => t?.includes('定制 Claude'))).toBe(true);
    expect(chipTexts.some((t) => t?.includes('Custom'))).toBe(true); // variantLabel
  });
});
