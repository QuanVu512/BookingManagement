'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { authMessage } from '../services/auth';
import { getLoginErrors, isEmail } from '../lib/auth-validation';

export type RecoveryMode =
  'verify-email' | 'resend-verification' | 'forgot-password' | 'reset-password';
type RecoveryValues = {
  email: string;
  password: string;
  confirmPassword: string;
};

export function useAuthRecoveryForm(mode: RecoveryMode) {
  const needsToken = mode === 'verify-email' || mode === 'reset-password';
  const token = useRecoveryToken(needsToken);
  const [values, setValues] = useState<RecoveryValues>({
    email: '',
    password: '',
    confirmPassword: '',
  });
  const submission = useRecoverySubmit(mode, values, token.value);
  function setField(field: keyof RecoveryValues, value: string) {
    if (!submission.busy)
      setValues((current) => ({ ...current, [field]: value }));
  }
  return {
    values,
    setField,
    needsToken,
    token: token.value,
    tokenError: token.error,
    ...submission,
  };
}

function useRecoveryToken(needsToken: boolean) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const processed = useRef(false);
  useEffect(() => {
    if (!needsToken || processed.current) return;
    processed.current = true;
    const supplied =
      new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    if (/^[a-f0-9]{64}$/.test(supplied)) setValue(supplied);
    else setError('Liên kết không hợp lệ hoặc đã hết hạn.');
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, [needsToken]);
  return { value, error };
}

function useRecoverySubmit(
  mode: RecoveryMode,
  values: RecoveryValues,
  token: string,
) {
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (locked.current) return;
    const validation = validateRecovery(mode, values, token);
    setError(validation);
    if (validation) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result = await authMessage(
        mode,
        recoveryPayload(mode, values, token),
      );
      setMessage(result.message);
    } catch (failure: unknown) {
      setError(
        failure instanceof Error ? failure.message : 'Chưa thể xử lý yêu cầu.',
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { error, message, busy, submit };
}

function recoveryPayload(
  mode: RecoveryMode,
  values: RecoveryValues,
  token: string,
) {
  if (mode === 'reset-password')
    return {
      token,
      password: values.password,
      confirmPassword: values.confirmPassword,
    };
  return mode === 'verify-email'
    ? { token }
    : { email: values.email.trim().toLowerCase() };
}

function validateRecovery(
  mode: RecoveryMode,
  values: RecoveryValues,
  token: string,
): string {
  if ((mode === 'verify-email' || mode === 'reset-password') && !token)
    return 'Liên kết không hợp lệ hoặc đã hết hạn.';
  if (
    (mode === 'forgot-password' || mode === 'resend-verification') &&
    !isEmail(values.email.trim())
  )
    return 'Vui lòng nhập email hợp lệ.';
  if (mode === 'reset-password') {
    const error = getLoginErrors('recovery', values.password).password;
    if (error) return error;
    if (values.password !== values.confirmPassword)
      return 'Mật khẩu xác nhận không khớp.';
  }
  return '';
}
