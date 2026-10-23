'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';

const FOCUSABLE =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

function trapTab(event: KeyboardEvent, dialog: HTMLElement) {
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
  const first = controls[0] ?? dialog;
  const last = controls.at(-1) ?? dialog;
  if (
    event.shiftKey &&
    (document.activeElement === first || document.activeElement === dialog)
  ) {
    event.preventDefault();
    last.focus();
  } else if (
    !event.shiftKey &&
    (document.activeElement === last || document.activeElement === dialog)
  ) {
    event.preventDefault();
    first.focus();
  }
}

export function useModalFocus(
  ref: RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (dialog.querySelector<HTMLElement>('input') ?? dialog).focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key === 'Tab') trapTab(event, dialog);
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof window.Node && !dialog.contains(event.target))
        dialog.focus();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocus);
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, [ref, onClose]);
}
