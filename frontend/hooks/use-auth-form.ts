'use client';

import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '../context/auth-context';
import type { RegistrationData } from '../types/auth';
import {
  getLoginErrors,
  getRegistrationErrors,
  normalizeRegistration,
} from '../lib/auth-validation';
import type { AuthFieldErrors } from '../lib/auth-validation';

export type AuthMode = 'login' | 'register';
const EMPTY_FORM: RegistrationData = {
  username: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  email: '',
  phone: '',
};

export function useAuthForm() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [values, setValues] = useState(EMPTY_FORM);
  const [capsLock, setCapsLock] = useState(false);
  const submission = useAuthSubmission(mode, values);
  function setField(field: keyof RegistrationData, value: string) {
    if (submission.isSubmitting) return;
    setValues((previous) => ({ ...previous, [field]: value }));
    submission.clearErrors();
  }
  function changeMode(nextMode: AuthMode) {
    if (submission.isSubmitting) return;
    setMode(nextMode);
    setValues(EMPTY_FORM);
    setCapsLock(false);
    submission.clearErrors();
  }
  return {
    mode,
    values,
    setField,
    changeMode,
    capsLock,
    setCapsLock,
    ...submission,
  };
}

function useAuthSubmission(mode: AuthMode, values: RegistrationData) {
  const { login, register } = useAuthActions();
  const router = useRouter();
  const [errors, setErrors] = useState<AuthFieldErrors>({});
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  function clearErrors() {
    setErrors({});
    setErrorMessage('');
    setSuccessMessage('');
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const validationErrors = getAuthFormErrors(mode, values);
    setErrors(validationErrors);
    setErrorMessage('');
    if (Object.keys(validationErrors).length > 0) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    try {
      if (mode === 'register') {
        const result = await register(normalizeRegistration(values));
        setSuccessMessage(result.message);
      } else {
        const user = await login(values.username, values.password);
        if (user.isStaffOrAdmin) router.push('/dashboard');
      }
    } catch (error: unknown) {
      setErrorMessage(getSubmissionError(error));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }
  return {
    errors,
    errorMessage,
    successMessage,
    isSubmitting,
    clearErrors,
    handleSubmit,
  };
}

function getAuthFormErrors(
  mode: AuthMode,
  values: RegistrationData,
): AuthFieldErrors {
  return mode === 'register'
    ? getRegistrationErrors(values)
    : getLoginErrors(values.username, values.password);
}

function getSubmissionError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Đã có lỗi xảy ra. Vui lòng thử lại.';
}
