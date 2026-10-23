'use client';

import { useState, useRef } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '../context/auth-context';
import { AuthRequestError } from '../services/auth';
import type { RegistrationData } from '../types/auth';
import {
  getLoginErrors,
  getRegistrationErrors,
  normalizeRegistration,
} from '../lib/auth-validation';
import type { AuthFieldErrors } from '../lib/auth-validation';
import {
  authReturnPath,
  rememberVerificationFlow,
} from '../lib/auth-navigation';

export type AuthMode = 'login' | 'register';
const EMPTY_FORM: RegistrationData = {
  username: '',
  password: '',
  confirmPassword: '',
  fullName: '',
  email: '',
  phone: '',
};

export function useAuthForm(mode: AuthMode = 'login') {
  const [values, setValues] = useState(EMPTY_FORM);
  const [capsLock, setCapsLock] = useState(false);
  const [editedFields, setEditedFields] = useState<Set<keyof RegistrationData>>(
    () => new Set(),
  );
  const submission = useAuthSubmission(mode, values);
  function setField(field: keyof RegistrationData, value: string) {
    if (submission.isSubmitting) return;
    setValues((previous) => ({ ...previous, [field]: value }));
    setEditedFields((previous) => new Set(previous).add(field));
    submission.clearErrors();
  }
  return {
    mode,
    values,
    setField,
    capsLock,
    setCapsLock,
    ...submission,
    errors: getVisibleErrors({
      mode,
      values,
      editedFields,
      submitted: submission.errors,
    }),
  };
}

function getVisibleErrors(input: {
  mode: AuthMode;
  values: RegistrationData;
  editedFields: Set<keyof RegistrationData>;
  submitted: AuthFieldErrors;
}): AuthFieldErrors {
  const errors = { ...input.submitted };
  if (input.mode !== 'register') return errors;
  const current = getRegistrationErrors(input.values);
  for (const field of ['password', 'confirmPassword'] as const) {
    if (input.editedFields.has(field)) errors[field] = current[field];
  }
  return errors;
}

function useAuthSubmission(mode: AuthMode, values: RegistrationData) {
  const execute = useAuthOperation(mode, values);
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
      setSuccessMessage(await execute());
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

function useAuthOperation(mode: AuthMode, values: RegistrationData) {
  const { login, register } = useAuthActions();
  const router = useRouter();
  return async () => {
    if (mode === 'register') {
      const result = await register(normalizeRegistration(values));
      rememberVerificationFlow({
        email: values.email.trim().toLowerCase(),
        token: result.verificationToken,
      });
      router.push(
        `/auth/verify-email?next=${encodeURIComponent(authReturnPath())}`,
      );
      return result.message;
    }
    try {
      const user = await login(values.username, values.password);
      router.push(user.isStaffOrAdmin ? '/dashboard' : authReturnPath());
    } catch (error: unknown) {
      if (
        !(error instanceof AuthRequestError) ||
        error.code !== 'EMAIL_VERIFICATION_REQUIRED' ||
        !error.verification
      )
        throw error;
      rememberVerificationFlow(error.verification);
      router.push(
        `/auth/verify-email?next=${encodeURIComponent(authReturnPath())}`,
      );
    }
    return '';
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
