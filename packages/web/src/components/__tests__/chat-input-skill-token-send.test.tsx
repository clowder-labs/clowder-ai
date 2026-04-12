/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInput } from '@/components/ChatInput';

vi.mock('@/components/icons/SendIcon', () => ({
  SendIcon: () => React.createElement('span', null, 'send'),
}));
vi.mock('@/components/icons/LoadingIcon', () => ({
  LoadingIcon: () => React.createElement('span', null, 'loading'),
}));
vi.mock('@/components/icons/AttachIcon', () => ({
  AttachIcon: () => React.createElement('span', null, 'attach'),
}));
vi.mock('@/components/ImagePreview', () => ({ ImagePreview: () => null }));
vi.mock('@/utils/compressImage', () => ({
  compressImage: (f: File) => Promise.resolve(f),
}));
vi.mock('@/hooks/useCatData', () => ({
  useCatData: () => ({
    cats: [],
    isLoading: false,
    getCatById: () => undefined,
    getCatsByBreed: () => new Map(),
  }),
}));
vi.mock('@/hooks/useVoiceInput', () => ({
  useVoiceInput: () => ({
    state: 'idle',
    transcript: '',
    partialTranscript: '',
    error: null,
    duration: 0,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePathCompletion', () => ({
  usePathCompletion: () => ({
    entries: [],
    isOpen: false,
    selectedIdx: 0,
    setSelectedIdx: vi.fn(),
    selectEntry: vi.fn(),
    close: vi.fn(),
    detectPath: vi.fn(),
  }),
}));
vi.mock('@/utils/skill-options-cache', () => ({
  fetchSkillOptionsWithCache: () =>
    Promise.resolve([
      { name: 'pdf' },
      { name: 'docx' },
      { name: 'xlsx' },
    ]),
  seedSkillOptionsCache: vi.fn(),
}));

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  delete (globalThis as { React?: typeof React }).React;
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function getTextbox(): HTMLDivElement {
  return container.querySelector('[role="textbox"]') as HTMLDivElement;
}

function getSendButton(): HTMLButtonElement {
  return container.querySelector('button[aria-label="Send message"]') as HTMLButtonElement;
}

function setTextboxValue(value: string) {
  const textbox = getTextbox();
  act(() => {
    textbox.textContent = value;
    textbox.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
  });
}

describe('ChatInput skill token send behavior', () => {
  it('keeps plain skill-like text as normal text when sending', async () => {
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend }));
    });
    await flush();

    setTextboxValue('need pdf docx xlsx files');

    act(() => {
      getSendButton().click();
    });

    expect(onSend).toHaveBeenCalledWith('need pdf docx xlsx files', undefined, undefined, undefined);
    expect(container.querySelector('[data-token-type="skill"]')).toBeNull();
  });

  it('converts explicit skill tokens into skill trigger text on send', async () => {
    const onSend = vi.fn();

    await act(async () => {
      root.render(React.createElement(ChatInput, { onSend }));
    });
    await flush();

    setTextboxValue('[[skill:pdf]]');
    await flush();

    const skillToken = container.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');

    act(() => {
      getSendButton().click();
    });

    expect(onSend).toHaveBeenCalledWith('使用 pdf 技能', undefined, undefined, undefined);
  });
});
