'use client';

import { useAuthRecoveryForm } from '../../hooks/use-auth-recovery-form';
import type { RecoveryMode } from '../../hooks/use-auth-recovery-form';
import { AUTH_LIMITS } from '../../lib/auth-validation';

type RecoveryFormState = ReturnType<typeof useAuthRecoveryForm>;
const TITLES: Record<RecoveryMode, string> = {
  'verify-email': 'Xác minh email',
  'resend-verification': 'Gửi lại email xác minh',
  'forgot-password': 'Quên mật khẩu',
  'reset-password': 'Đặt lại mật khẩu',
};

export function AuthRecoveryForm({ mode }: { mode: RecoveryMode }) {
  const form = useAuthRecoveryForm(mode);
  return (
    <main
      className="container"
      style={{ maxWidth: '480px', padding: '36px 24px' }}
    >
      <h1>{TITLES[mode]}</h1>
      <RecoveryStatus form={form} />
      <RecoveryForm mode={mode} form={form} />
      <p>
        <a href="/">Về trang chủ và đăng nhập</a>
      </p>
    </main>
  );
}

function RecoveryStatus({ form }: { form: RecoveryFormState }) {
  const error = form.error || form.tokenError;
  return (
    <>
      {error && (
        <p id="recovery-error" role="alert">
          {error}
        </p>
      )}
      {form.message && <p role="status">{form.message}</p>}
    </>
  );
}

function RecoveryForm({
  mode,
  form,
}: {
  mode: RecoveryMode;
  form: RecoveryFormState;
}) {
  return (
    <form onSubmit={form.submit} noValidate aria-busy={form.busy}>
      <fieldset disabled={form.busy || Boolean(form.message)}>
        <RecoveryFields form={form} mode={mode} />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={form.busy || (form.needsToken && !form.token)}
        >
          {form.busy ? 'Đang xử lý...' : TITLES[mode]}
        </button>
      </fieldset>
    </form>
  );
}

function RecoveryFields({
  mode,
  form,
}: {
  mode: RecoveryMode;
  form: RecoveryFormState;
}) {
  if (!form.needsToken)
    return <RecoveryInput form={form} field="email" label="Email" />;
  if (mode !== 'reset-password') return null;
  return (
    <>
      <p id="password-policy">
        Mật khẩu 12–128 ký tự; hỗ trợ Unicode và khoảng trắng.
      </p>
      <RecoveryInput form={form} field="password" label="Mật khẩu mới" />
      <RecoveryInput
        form={form}
        field="confirmPassword"
        label="Xác nhận mật khẩu"
      />
    </>
  );
}

function RecoveryInput({
  form,
  field,
  label,
}: {
  form: RecoveryFormState;
  field: 'email' | 'password' | 'confirmPassword';
  label: string;
}) {
  const id = `recovery-${field}`;
  const description =
    [
      field === 'password' ? 'password-policy' : '',
      form.error ? 'recovery-error' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <p>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type={field === 'email' ? 'email' : 'password'}
        autoComplete={field === 'email' ? 'email' : 'new-password'}
        maxLength={field === 'email' ? AUTH_LIMITS.emailMax : undefined}
        value={form.values[field]}
        onChange={(event) => form.setField(field, event.target.value)}
        aria-invalid={Boolean(form.error)}
        aria-describedby={description}
      />
    </p>
  );
}
