/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import VersionUpdateModal from '../VersionUpdateModal';
import { apiFetch } from '@/utils/api-client';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(),
}));

describe('VersionUpdateModal', () => {
  let container: HTMLDivElement;
  let root: Root;
  const mockedApiFetch = vi.mocked(apiFetch);

  beforeAll(() => {
    (globalThis as { React?: typeof React }).React = React;
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mockedApiFetch.mockReset();
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  afterAll(() => {
    delete (globalThis as { React?: typeof React }).React;
    delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
  });

  const mockVersionResponse = (
    versionInfo: {
      curversion: string;
      lastversion: string;
      description: string;
      downloadUrl?: string;
      download_url?: string;
    },
  ) => {
    mockedApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(versionInfo),
    } as Response);
  };

  it('uses the OfficeClaw icon in the update dialog', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const image = container.querySelector('img');
    expect(image).not.toBeNull();
    expect(image?.getAttribute('src')).toBe('/images/lobster.svg');
    expect(image?.className).toContain('w-[64px]');
    expect(image?.className).toContain('h-[64px]');
  });

  it('uses a 24x24 close icon', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const closeIcon = container.querySelector('button svg');
    expect(closeIcon).not.toBeNull();
    expect(closeIcon?.getAttribute('class')).toContain('h-6');
    expect(closeIcon?.getAttribute('class')).toContain('w-6');
  });

  it('uses version-bg.svg as the dialog card background', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const card = container.querySelector('.shadow-lg');
    expect(card).not.toBeNull();
    expect(card).toBeInstanceOf(HTMLElement);
    expect((card as HTMLElement).style.backgroundImage).toBe('url("/images/version-bg.svg")');
  });

  it('uses a 360px dialog width', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const card = container.querySelector('.shadow-lg');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('w-[360px]');
  });

  it('uses a 16px dialog corner radius', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const card = container.querySelector('.shadow-lg');
    expect(card).not.toBeNull();
    expect(card?.className).toContain('rounded-[16px]');
  });

  it('left aligns the icon when a new version is available', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const image = container.querySelector('img');
    expect(image?.parentElement?.className).toContain('justify-start');
  });

  it('centers the icon when there is no new version', async () => {
    mockVersionResponse({
      curversion: '1.0.1',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const image = container.querySelector('img');
    expect(image?.parentElement?.className).toContain('justify-center');
  });

  it('styles the new version title with the specified gradient text', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const title = container.querySelector('[data-testid="version-update-title"]');
    expect(title).not.toBeNull();
    expect(title).toBeInstanceOf(HTMLElement);

    const styleAttr = title?.getAttribute('style') ?? '';
    expect(styleAttr).toContain('linear-gradient(224.38deg');
    expect(styleAttr).toContain('-webkit-text-fill-color: transparent');
    expect(styleAttr).toContain('font-size: 20px');
    expect(styleAttr).toContain('font-weight: 700');
    expect(styleAttr).toContain('line-height: 30px');
  });

  it('left aligns the content area when a new version is available', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const content = container.querySelector('[data-testid="version-update-content"]');
    expect(content).not.toBeNull();
    expect(content?.className).toContain('text-left');
  });

  it('left aligns the action buttons when a new version is available', async () => {
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const actions = container.querySelector('[data-testid="version-update-actions"]');
    expect(actions).not.toBeNull();
    expect(actions?.className).toContain('justify-start');
  });

  it('calls onCancel when clicking the later button', async () => {
    const onCancel = vi.fn();
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel }));
      await Promise.resolve();
    });

    const laterButton = container.querySelector('[data-testid="version-update-cancel"]');
    expect(laterButton).not.toBeNull();
    expect(laterButton?.className).toContain('ui-button-default');

    await act(async () => {
      laterButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('opens the download url immediately when clicking update', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    mockVersionResponse({
      curversion: '1.0.0',
      lastversion: '1.0.1',
      description: 'bug fixes',
      downloadUrl: 'https://example.com/update.exe',
    });

    await act(async () => {
      root.render(React.createElement(VersionUpdateModal, { open: true, onCancel: vi.fn() }));
      await Promise.resolve();
    });

    const updateButton = container.querySelector('[data-testid="version-update-confirm"]');
    expect(updateButton).not.toBeNull();
    expect(updateButton?.className).toContain('ui-button-primary');

    await act(async () => {
      updateButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(openSpy).toHaveBeenCalledWith('https://example.com/update.exe', '_blank');
    expect(container.textContent).not.toContain('下载中');

    openSpy.mockRestore();
  });
});
