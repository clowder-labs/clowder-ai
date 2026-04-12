import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import SecurityManagementModal from '../SecurityManagementModal';

describe('SecurityManagementModal', () => {
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

  it('renders the static security management layout and policy table', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      await Promise.resolve();
    });

    const modal = container.querySelector('[data-testid="security-management-modal"]');
    expect(modal).toBeTruthy();
    expect(modal?.className).toContain('ui-modal-panel');
    expect(container.textContent).toContain('瀹夊叏绠＄悊');
    expect(container.textContent).toContain('鏄惁寮€鍚鎵规姢鏍?);
    expect(container.textContent).toContain('瀹夊叏绛栫暐閰嶇疆');
    expect(container.textContent).toContain('鏁忔劅鎿嶄綔');
    expect(container.textContent).toContain('椋庨櫓绛夌骇');
    expect(container.textContent).toContain('鍦ㄥ璇濅腑鏄惁闇€瑕佸鎵?);
    expect(container.textContent).toContain('mcp_exec_command');
    expect(container.textContent).toContain('楂橀闄?);
  });

  it('keeps the approval toggle on the title row and the description on its own full-width line', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      await Promise.resolve();
    });

    const header = container.querySelector('[data-testid="security-management-approval-header"]');
    const description = container.querySelector('[data-testid="security-management-approval-description"]');
    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    expect(header).toBeTruthy();
    expect(header?.className).toContain('items-center');
    expect(header?.contains(pageToggle)).toBe(true);
    expect(header?.textContent).toContain('鏄惁寮€鍚鎵规姢鏍?);
    expect(description).toBeTruthy();
    expect(description?.className).toContain('w-full');
    expect(header?.contains(description)).toBe(false);
  });

  it('hides the policy section when the approval guard is turned off', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      await Promise.resolve();
    });

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;

    expect(container.querySelector('[data-testid="security-management-policy-section"]')).toBeTruthy();

    await act(async () => {
      pageToggle?.click();
      await Promise.resolve();
    });

    expect(pageToggle?.getAttribute('aria-checked')).toBe('false');
    expect(container.querySelector('[data-testid="security-management-policy-section"]')).toBeNull();
    expect(container.textContent).not.toContain('瀹夊叏绛栫暐閰嶇疆');
  });

  it('toggles approval switches in the static preview', async () => {
    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose: vi.fn() }));
      await Promise.resolve();
    });

    const pageToggle = container.querySelector(
      '[data-testid="security-management-approval-bar-toggle"]',
    ) as HTMLButtonElement | null;
    const policyToggle = container.querySelector('[data-testid="security-policy-toggle-policy-2"]') as HTMLButtonElement | null;

    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
    expect(policyToggle?.getAttribute('aria-checked')).toBe('false');

    await act(async () => {
      pageToggle?.click();
      pageToggle?.click();
      policyToggle?.click();
      await Promise.resolve();
    });

    expect(pageToggle?.getAttribute('aria-checked')).toBe('true');
    expect(policyToggle?.getAttribute('aria-checked')).toBe('true');
    expect(container.textContent).toContain('鏄?);
  });

  it('uses a 700px panel width and does not close on backdrop click', async () => {
    const onClose = vi.fn();

    await act(async () => {
      root.render(React.createElement(SecurityManagementModal, { open: true, onClose }));
      await Promise.resolve();
    });

    const modal = container.querySelector('[data-testid="security-management-modal"]');
    const backdrop = container.querySelector('[data-testid="security-management-modal-backdrop"]') as HTMLDivElement | null;

    expect(modal?.className).toContain('w-[700px]');

    await act(async () => {
      backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="security-management-modal"]')).toBeTruthy();
  });
});
