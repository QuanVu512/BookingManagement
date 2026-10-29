import { describe, expect, it, jest } from '@jest/globals';
import { JSDOM } from 'jsdom';
import { act } from 'react';
import { GuestBookingForm } from '../features/payment/components/guest-booking-form.js';
import { StaffOpsPanel } from '../features/payment/components/staff-ops-panel.js';

const dom = new JSDOM('<div id="app"></div>', {
  url: 'http://127.0.0.1:14003',
});
for (const [name, value] of Object.entries({
  window: dom.window,
  self: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  IS_REACT_ACT_ENVIRONMENT: true,
}))
  Object.defineProperty(globalThis, name, { value, configurable: true });
const { createRoot } = await import('react-dom/client');

function render(element: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

describe('GuestBookingForm (FE-PAY-04, MIG-11/MIG-17)', () => {
  it('renders 30% deposit guest copy and validates required fields', () => {
    const onCreated = jest.fn();
    const { container, root } = render(
      <GuestBookingForm courtId="court-1" onCreated={onCreated} />,
    );
    expect(container.textContent?.toLowerCase()).toMatch(/khách chưa có tài khoản|khách vãng lai/);
    expect(container.textContent).toContain('30%');
    expect(container.textContent).not.toContain('45.000');
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    act(() => {
      form?.dispatchEvent(
        new dom.window.Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});

describe('StaffOpsPanel (FE-PAY-08, MIG-16)', () => {
  it('exposes E12/E14/E15/E16/E17–E22 actions without fake data', () => {
    const { container, root } = render(<StaffOpsPanel />);
    const text = container.textContent ?? '';
    for (const label of [
      'Tra cứu (E12)',
      'Thu số dư (E14)',
      'Phân bổ receipt (E16)',
      'Đối soát request (E15)',
      'Hoàn tiền (E17–E22)',
      'Duyệt (four-eyes)',
    ]) {
      expect(text).toContain(label);
    }
    expect(text).not.toContain('đảm bảo');
    act(() => root.unmount());
    container.remove();
  });
});
