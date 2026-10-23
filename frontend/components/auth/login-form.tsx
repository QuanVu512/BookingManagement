'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { useAuthForm } from '../../hooks/use-auth-form';
import { useLoginPreferences } from '../../hooks/use-login-preferences';
import { AUTH_LIMITS } from '../../lib/auth-validation';
import { LoginIcon } from './login-icons';
import styles from './login-page.module.css';

export type LoginFormState = ReturnType<typeof useAuthForm>;
type LoginPreferences = ReturnType<typeof useLoginPreferences>;

function FieldError({
  form,
  field,
}: {
  form: LoginFormState;
  field: 'username' | 'password';
}) {
  return form.errors[field] ? (
    <span id={`auth-${field}-error`} className={styles.fieldError} role="alert">
      {form.errors[field]}
    </span>
  ) : null;
}

function IdentifierField({ form }: { form: LoginFormState }) {
  return (
    <div className={styles.field}>
      <label htmlFor="auth-username">
        Tên đăng nhập, email hoặc số điện thoại
      </label>
      <div className={styles.inputWrap}>
        <span className={styles.inputIcon}>
          <LoginIcon name="user" />
        </span>
        <IdentifierInput form={form} />
      </div>
      <FieldError form={form} field="username" />
    </div>
  );
}

function IdentifierInput({ form }: { form: LoginFormState }) {
  return (
    <input
      id="auth-username"
      name="username"
      type="text"
      required
      autoFocus
      autoComplete="username"
      maxLength={AUTH_LIMITS.identifierMax}
      placeholder="name@domain.com hoặc 0912..."
      value={form.values.username}
      onChange={(event) => form.setField('username', event.target.value)}
      aria-invalid={Boolean(form.errors.username)}
      aria-describedby={
        form.errors.username ? 'auth-username-error' : undefined
      }
    />
  );
}

function PasswordControl({
  form,
  visible,
}: {
  form: LoginFormState;
  visible: boolean;
}) {
  const updateCapsLock = (event: KeyboardEvent<HTMLInputElement>) =>
    form.setCapsLock(event.getModifierState('CapsLock'));
  return (
    <input
      id="auth-password"
      name="password"
      type={visible ? 'text' : 'password'}
      required
      autoComplete="current-password"
      value={form.values.password}
      onChange={(event) => form.setField('password', event.target.value)}
      onKeyDown={updateCapsLock}
      onKeyUp={updateCapsLock}
      onBlur={() => form.setCapsLock(false)}
      aria-invalid={Boolean(form.errors.password)}
      aria-describedby={
        form.errors.password ? 'auth-password-error' : undefined
      }
    />
  );
}

function PasswordInput({ form }: { form: LoginFormState }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className={`${styles.inputWrap} ${styles.passwordInput}`}>
      <span className={styles.inputIcon}>
        <LoginIcon name="lock" />
      </span>
      <PasswordControl form={form} visible={visible} />
      <button
        type="button"
        className={styles.passwordToggle}
        aria-label={`${visible ? 'Ẩn' : 'Hiện'} mật khẩu`}
        aria-pressed={visible}
        onClick={() => setVisible(!visible)}
      >
        {visible ? 'Ẩn' : 'Hiện'}
      </button>
    </div>
  );
}

function PasswordField({ form }: { form: LoginFormState }) {
  return (
    <div className={styles.field}>
      <div className={styles.labelRow}>
        <label htmlFor="auth-password">Mật khẩu</label>
        <Link href="/auth/forgot-password">Quên mật khẩu?</Link>
      </div>
      <PasswordInput form={form} />
      <FieldError form={form} field="password" />
      {form.capsLock && (
        <p className={styles.warning} role="status">
          Caps Lock đang bật.
        </p>
      )}
    </div>
  );
}

function SubmitButton({ busy }: { busy: boolean }) {
  return (
    <button type="submit" className={styles.submit}>
      {busy && <span className={styles.spinner} aria-hidden="true" />}
      <span>{busy ? 'Đang xác thực...' : 'Đăng nhập'}</span>
      {!busy && <LoginIcon name="arrow" />}
    </button>
  );
}

function RememberIdentifier({
  preferences,
}: {
  preferences: LoginPreferences;
}) {
  return (
    <label className={styles.remember}>
      <input
        type="checkbox"
        checked={preferences.rememberIdentifier}
        onChange={(event) =>
          preferences.setRememberIdentifier(event.target.checked)
        }
      />
      <span>Ghi nhớ tên đăng nhập trên thiết bị này</span>
    </label>
  );
}

function LoginFields({
  form,
  preferences,
}: {
  form: LoginFormState;
  preferences: LoginPreferences;
}) {
  return (
    <fieldset disabled={form.isSubmitting}>
      <IdentifierField form={form} />
      <PasswordField form={form} />
      <RememberIdentifier preferences={preferences} />
      <SubmitButton busy={form.isSubmitting} />
    </fieldset>
  );
}

export function LoginForm({ form }: { form: LoginFormState }) {
  const preferences = useLoginPreferences((identifier) =>
    form.setField('username', identifier),
  );
  return (
    <form
      className={styles.form}
      aria-labelledby="login-title"
      noValidate
      aria-describedby={form.errorMessage ? 'login-error' : undefined}
      aria-busy={form.isSubmitting}
      onSubmit={(event) => {
        preferences.saveIdentifier(form.values.username);
        void form.handleSubmit(event);
      }}
    >
      <LoginFields form={form} preferences={preferences} />
    </form>
  );
}
