'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useEmailVerification } from '../../hooks/use-email-verification';
import { authReturnPath } from '../../lib/auth-navigation';
import { AUTH_LIMITS } from '../../lib/auth-validation';
import { AuthShell } from './auth-page';
import styles from './auth-form.module.css';
import page from './auth-page.module.css';
import { OtpInput } from './otp-input';

export function EmailVerificationPage() {
  const form = useEmailVerification();
  const [next, setNext] = useState('/');
  useEffect(() => setNext(authReturnPath()), []);
  return (
    <AuthShell
      title={form.verified ? 'Email đã được xác minh' : 'Xác minh email'}
      description="Mã hết hạn sau 5 phút hoặc khi mã mới được tạo."
    >
      {form.error && (
        <p id="otp-error" className={styles.error} role="alert">
          {form.error}
        </p>
      )}
      {form.message && (
        <p
          key={form.noticeId}
          className={`${page.success} ${!form.verified ? page.otpNotice : ''}`}
          role="status"
        >
          {form.message}
        </p>
      )}
      {!form.verified && <VerificationForm form={form} />}
      <p className={page.switch}>
        <Link href={`/auth/login?next=${encodeURIComponent(next)}`}>
          {form.verified ? 'Tiếp tục đăng nhập →' : 'Quay lại đăng nhập'}
        </Link>
      </p>
    </AuthShell>
  );
}

function VerificationForm({
  form,
}: {
  form: ReturnType<typeof useEmailVerification>;
}) {
  return (
    <>
      <form onSubmit={form.submit} noValidate aria-busy={form.busy}>
        <fieldset disabled={form.busy} className={styles.fields}>
          <div className={`form-group ${styles.field}`}>
            <label className="form-label" htmlFor="verification-email">
              Email đăng ký
            </label>
            <input
              id="verification-email"
              className="form-input"
              type="email"
              autoComplete="email"
              required
              maxLength={AUTH_LIMITS.emailMax}
              value={form.email}
              onChange={(event) => form.setEmail(event.target.value)}
              aria-invalid={Boolean(form.error)}
              aria-describedby={form.error ? 'otp-error' : undefined}
            />
          </div>
          <div className={`form-group ${styles.field}`}>
            <span className="form-label" id="verification-code-label">
              Mã OTP
            </span>
            <OtpInput
              digits={form.digits}
              onChange={form.setDigits}
              error={form.error}
            />
          </div>
          <button className={`btn btn-primary ${styles.submit}`} type="submit">
            {form.busy ? 'Đang xử lý...' : 'Xác minh email'}
          </button>
        </fieldset>
      </form>
      <button
        type="button"
        className={page.resend}
        disabled={form.busy || form.remaining > 0}
        onClick={form.resend}
      >
        {form.remaining > 0
          ? `Gửi lại sau ${form.remaining}s`
          : 'Gửi lại mã OTP'}
      </button>
      <p className={page.policy}>
        Chưa thấy email? Kiểm tra thư rác hoặc yêu cầu mã mới.
      </p>
    </>
  );
}
