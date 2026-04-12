/*
 * *
 *  * Copyright (C) Huawei Technologies Co., Ltd. 2026. All rights reserved.
 *
 */

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RichTextarea } from '@/components/RichTextarea';

beforeAll(() => {
  (globalThis as { React?: typeof React }).React = React;
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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
});

describe('RichTextarea skill tokens', () => {
  it('does not highlight plain skill-like text as a skill token', () => {
    act(() => {
      root.render(
        <RichTextarea
          value="need pdf docx xlsx files"
          onValueChange={() => {}}
          skillOptions={[{ name: 'pdf' }, { name: 'docx' }, { name: 'xlsx' }]}
        />,
      );
    });

    expect(container.querySelector('[data-token-type="skill"]')).toBeNull();
    expect(container.textContent).toContain('need pdf docx xlsx files');
  });

  it('renders an explicitly inserted skill token as a skill chip', () => {
    act(() => {
      root.render(
        <RichTextarea
          value="need [[skill:pdf]] files"
          onValueChange={() => {}}
          skillOptions={[{ name: 'pdf' }]}
        />,
      );
    });

    const skillToken = container.querySelector('[data-token-type="skill"]') as HTMLElement | null;
    expect(skillToken).toBeTruthy();
    expect(skillToken?.getAttribute('data-token-value')).toBe('[[skill:pdf]]');
    expect(skillToken?.textContent).toContain('pdf');
  });
});
