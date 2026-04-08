import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import VersionUpdateModal from '../VersionUpdateModal';

vi.mock('@/utils/api-client', () => ({
  apiFetch: vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          curversion: '1.0.0',
          lastversion: '1.0.1',
          description: 'bug fixes',
        }),
    }),
  ),
}));

describe('VersionUpdateModal', () => {
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

  it('uses the OfficeClaw icon in the update dialog', async () => {
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
});
