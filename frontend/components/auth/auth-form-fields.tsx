'use client';

import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { RegistrationData } from '../../types/auth';
import { AUTH_LIMITS } from '../../lib/auth-validation';
import type { AuthFieldErrors } from '../../lib/auth-validation';
import styles from './auth-form.module.css';

interface FieldProps {
  name: keyof RegistrationData;
  label: string;
  placeholder?: string;
  type?: string;
  value: string;
  error?: string;
  autoComplete?: string;
  maxLength?: number;
  autoFocus?: boolean;
  onChange: (name: keyof RegistrationData, value: string) => void;
}

export function AuthField({
  name,
  label,
  placeholder,
  type = 'text',
  value,
  error,
  autoComplete,
  maxLength,
  autoFocus,
  onChange,
}: FieldProps) {
  return (
    <div className={`form-group ${styles.field}`}>
      <label className="form-label" htmlFor={`auth-${name}`}>
        {label}
      </label>
      <input
        id={`auth-${name}`}
        name={name}
        type={type}
        className="form-input"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        required
        autoComplete={autoComplete}
        maxLength={maxLength}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `auth-${name}-error` : undefined}
      />
      {error && (
        <span
          id={`auth-${name}-error`}
          className={styles.fieldError}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}

interface PasswordProps extends FieldProps {
  setCapsLock: (active: boolean) => void;
  isRegistration: boolean;
}

export function PasswordField({
  name,
  label,
  placeholder,
  value,
  error,
  onChange,
  setCapsLock,
  isRegistration,
}: PasswordProps) {
  const [isVisible, setIsVisible] = useState(false);
  const updateCapsLock = (event: KeyboardEvent<HTMLInputElement>) =>
    setCapsLock(event.getModifierState('CapsLock'));
  return (
    <div className={`form-group ${styles.field}`}>
      <label className="form-label" htmlFor={`auth-${name}`}>
        {label}
      </label>
      <div className={styles.passwordInput}>
        <input
          id={`auth-${name}`}
          name={name}
          className="form-input"
          type={isVisible ? 'text' : 'password'}
          placeholder={placeholder}
          value={value}
          required
          onChange={(event) => onChange(name, event.target.value)}
          onKeyDown={updateCapsLock}
          onKeyUp={updateCapsLock}
          onBlur={() => setCapsLock(false)}
          autoComplete={isRegistration ? 'new-password' : 'current-password'}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `auth-${name}-error` : undefined}
        />
        <button
          type="button"
          className={styles.passwordToggle}
          onClick={() => setIsVisible(!isVisible)}
          aria-pressed={isVisible}
          aria-label={`${isVisible ? 'Ẩn' : 'Hiện'} ${label.toLowerCase()}`}
        >
          {isVisible ? 'Ẩn' : 'Hiện'}
        </button>
      </div>
      {error && (
        <span
          id={`auth-${name}-error`}
          className={styles.fieldError}
          role="alert"
        >
          {error}
        </span>
      )}
    </div>
  );
}

export function RegistrationFields({
  values,
  errors,
  setField,
}: {
  values: RegistrationData;
  errors: AuthFieldErrors;
  setField: FieldProps['onChange'];
}) {
  return (
    <div className={styles.registrationFields}>
      <AuthField
        name="fullName"
        label="Họ và tên"
        placeholder="Nguyễn Văn A"
        value={values.fullName}
        error={errors.fullName}
        autoComplete="name"
        maxLength={AUTH_LIMITS.fullNameMax}
        onChange={setField}
      />
      <AuthField
        name="email"
        label="Email liên hệ"
        type="email"
        placeholder="example@gmail.com"
        value={values.email}
        error={errors.email}
        autoComplete="email"
        maxLength={AUTH_LIMITS.emailMax}
        onChange={setField}
      />
      <AuthField
        name="phone"
        label="Số điện thoại"
        type="tel"
        placeholder="03xxxxxxxx"
        value={values.phone}
        error={errors.phone}
        autoComplete="tel"
        maxLength={AUTH_LIMITS.phoneMax}
        onChange={setField}
      />
    </div>
  );
}
