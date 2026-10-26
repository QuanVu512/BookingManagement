'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { useAuthForm, type AuthMode } from '../../hooks/use-auth-form';
import { AUTH_LIMITS } from '../../lib/auth-validation';
import {
  AuthField,
  PasswordField,
  RegistrationFields,
} from './auth-form-fields';
import styles from './auth-form.module.css';
import page from './auth-page.module.css';
import { authReturnPath } from '../../lib/auth-navigation';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '../../context/auth-context';
import { GuestConfirmDialog } from './guest-confirm-dialog';
import { LoginScreen } from './login-screen';
import { ArenaLogo } from '../arena/arena-logo';
import { LegalFooter } from '../../features/legal/components/legal-footer';
import { CollectionNotice } from '../../features/legal/components/collection-notice';

type FormState = ReturnType<typeof useAuthForm>;

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const shell = page;
  return (
    <main className={shell.wrap}>
      <section className={shell.panel} aria-labelledby="auth-title">
        <Link
          className={shell.logo}
          href="/"
          aria-label="SMASH ARENA — Trang chủ"
        >
          <ArenaLogo size={32} className="text-[#10e760]" />
        </Link>
        <p className={shell.brand}>SMASH ARENA</p>
        <h1 id="auth-title">{title}</h1>
        <p className={shell.description}>{description}</p>
        {children}
      </section>
      <Link className={shell.back} href="/">
        ← Về trang chủ
      </Link>
      <div style={{ width: '100%', maxWidth: '440px', marginTop: '1.5rem' }}>
        <LegalFooter variant="compact" />
      </div>
    </main>
  );
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const form = useAuthForm(mode);
  const registering = mode === 'register';
  if (!registering) return <LoginScreen form={form} />;
  return (
    <AuthShell
      title={registering ? 'Tạo tài khoản' : 'Đăng nhập'}
      description={
        registering
          ? 'Sẵn sàng cho trận đấu tiếp theo của bạn.'
          : 'Chào mừng trở lại. Sân đấu đang chờ bạn.'
      }
    >
      <AuthForm form={form} />
      <p className={page.switch}>
        {registering ? 'Đã có tài khoản?' : 'Chưa có tài khoản?'}{' '}
        <AuthSwitch mode={mode} />
      </p>
      <GuestOption />
    </AuthShell>
  );
}

function GuestOption() {
  const { openGuestConfirm } = useAuthActions();
  const router = useRouter();
  return (
    <>
      <button className={page.resend} type="button" onClick={openGuestConfirm}>
        Tiếp tục không cần tài khoản
      </button>
      <GuestConfirmDialog onProceed={() => router.push(authReturnPath())} />
    </>
  );
}

function AuthSwitch({ mode }: { mode: AuthMode }) {
  const target = mode === 'register' ? 'login' : 'register';
  const [next, setNext] = useState('/');
  useEffect(() => setNext(authReturnPath()), []);
  return (
    <Link href={`/auth/${target}?next=${encodeURIComponent(next)}`}>
      {target === 'login' ? 'Đăng nhập' : 'Đăng ký'}
    </Link>
  );
}

function AuthForm({ form }: { form: FormState }) {
  const registering = form.mode === 'register';
  return (
    <>
      {form.errorMessage && (
        <p className={styles.error} role="alert">
          {form.errorMessage}
        </p>
      )}
      <form
        onSubmit={form.handleSubmit}
        noValidate
        aria-busy={form.isSubmitting}
      >
        <fieldset disabled={form.isSubmitting} className={styles.fields}>
          <AccountFields form={form} />
          <PasswordFields form={form} />
          {registering && <CollectionNotice />}
          <button type="submit" className={`btn btn-primary ${styles.submit}`}>
            {form.isSubmitting && (
              <span className={styles.spinner} aria-hidden="true" />
            )}
            {form.isSubmitting
              ? 'Đang xử lý...'
              : registering
                ? 'Tạo tài khoản'
                : 'Đăng nhập'}
          </button>
        </fieldset>
      </form>
      {!registering && (
        <div className={page.help}>
          <Link href="/auth/forgot-password">Quên mật khẩu?</Link>
        </div>
      )}
    </>
  );
}

function AccountFields({ form }: { form: FormState }) {
  const registering = form.mode === 'register';
  return (
    <>
      <AuthField
        name="username"
        label={
          registering
            ? 'Tên đăng nhập'
            : 'Tên đăng nhập, email hoặc số điện thoại'
        }
        value={form.values.username}
        error={form.errors.username}
        autoComplete="username"
        autoFocus
        maxLength={
          registering ? AUTH_LIMITS.usernameMax : AUTH_LIMITS.identifierMax
        }
        onChange={form.setField}
      />
      {registering && (
        <RegistrationFields
          values={form.values}
          errors={form.errors}
          setField={form.setField}
        />
      )}
    </>
  );
}

function PasswordFields({ form }: { form: FormState }) {
  const registering = form.mode === 'register';
  return (
    <>
      {form.capsLock && (
        <p className={styles.warning} role="status">
          Caps Lock đang bật.
        </p>
      )}
      <PasswordField
        name="password"
        label="Mật khẩu"
        value={form.values.password}
        error={form.errors.password}
        onChange={form.setField}
        setCapsLock={form.setCapsLock}
        isRegistration={registering}
      />
      {registering && (
        <>
          <PasswordField
            name="confirmPassword"
            label="Xác nhận mật khẩu"
            value={form.values.confirmPassword}
            error={form.errors.confirmPassword}
            onChange={form.setField}
            setCapsLock={form.setCapsLock}
            isRegistration
          />
        </>
      )}
    </>
  );
}
