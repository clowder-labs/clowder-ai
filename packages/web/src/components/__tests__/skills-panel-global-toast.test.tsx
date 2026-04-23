/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SkillsPanel } from '@/components/SkillsPanel';
import { ToastContainer } from '@/components/ToastContainer';
import { useToastStore } from '@/stores/toastStore';

vi.mock('@/components/HubCapabilityTab', () => ({
  HubCapabilityTab: ({
    onImport,
    onSelectSkill,
  }: {
    onImport?: () => void;
    onSelectSkill?: (selection: { skillName: string; avatarUrl?: string | null }) => void;
  }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'installed-panel-import',
          onClick: onImport,
        },
        'Import',
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          'data-testid': 'installed-panel-open-detail',
          onClick: () =>
            onSelectSkill?.({
              skillName: 'demo-skill',
              avatarUrl: '/avatars/demo-skill.png',
            }),
        },
        'Open detail',
      ),
    ),
}));

vi.mock('@/components/HubSkillsTab', () => ({
  HubSkillsTab: () => React.createElement('div', { 'data-testid': 'market-panel' }),
}));

vi.mock('@/components/UploadSkillModal', () => ({
  UploadSkillModal: ({
    open,
    onSuccess,
  }: {
    open: boolean;
    onSuccess: () => void;
  }) =>
    open
      ? React.createElement(
          'button',
          {
            type: 'button',
            onClick: onSuccess,
          },
          'Mock upload success',
        )
      : null,
}));

vi.mock('@/components/SkillDetailView', () => ({
  SkillDetailView: ({
    skillName,
    avatarUrl,
    onBack,
  }: {
    skillName: string;
    avatarUrl?: string | null;
    onBack: () => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'skill-detail-view' },
      React.createElement('div', null, `Detail:${skillName}`),
      React.createElement('div', null, `AvatarUrl:${avatarUrl ?? 'none'}`),
      React.createElement(
        'button',
        {
          type: 'button',
          onClick: onBack,
        },
        'Back',
      ),
    ),
}));

describe('SkillsPanel global upload toast', () => {
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
    useToastStore.setState({ toasts: [] });
    window.localStorage.removeItem('office-claw:skills-plaza-risk-ack:v1');
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it('routes upload success feedback through the global toast store', async () => {
    await act(async () => {
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(SkillsPanel),
          React.createElement(ToastContainer),
        ),
      );
    });

    const importButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Import'),
    );
    expect(importButton).toBeDefined();

    await act(async () => {
      importButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    const successButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Mock upload success'),
    );
    expect(successButton).toBeDefined();

    await act(async () => {
      successButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(
      useToastStore.getState().toasts.some((toast) => toast.type === 'success' && toast.title === '上传成功' && toast.message === '技能上传成功'),
    ).toBe(true);
  });

  it('switches from installed list to detail view and back inside SkillsPanel', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsPanel));
    });

    const openDetailButton = container.querySelector('[data-testid="installed-panel-open-detail"]') as HTMLButtonElement | null;
    expect(openDetailButton).not.toBeNull();

    await act(async () => {
      openDetailButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="skill-detail-view"]')).not.toBeNull();
    expect(container.textContent).toContain('Detail:demo-skill');
    expect(container.textContent).toContain('AvatarUrl:/avatars/demo-skill.png');
    expect(container.querySelector('[data-testid="installed-panel-import"]')).toBeNull();
    expect(container.textContent).not.toContain('技能广场');

    const backButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Back'),
    );
    expect(backButton).toBeDefined();

    await act(async () => {
      backButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="skill-detail-view"]')).toBeNull();
    expect(container.querySelector('[data-testid="installed-panel-import"]')).not.toBeNull();
  });

  it('closes the skill plaza risk modal when Escape key is pressed', async () => {
    await act(async () => {
      root.render(React.createElement(SkillsPanel));
    });

    const skillPlazaButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('技能广场'),
    );
    expect(skillPlazaButton).toBeDefined();

    await act(async () => {
      skillPlazaButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).toContain('风险提示');

    await act(async () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('风险提示');
  });
});
