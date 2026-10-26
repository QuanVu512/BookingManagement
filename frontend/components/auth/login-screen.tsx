'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthActions } from '../../context/auth-context';
import { authReturnPath } from '../../lib/auth-navigation';
import { GuestConfirmDialog } from './guest-confirm-dialog';
import { LoginForm, type LoginFormState } from './login-form';
import { LoginIcon } from './login-icons';
import { ArenaLogo } from '../arena/arena-logo';
import { LoginWaveBackground } from './login-wave-background';
import { CookiePreferencesTrigger } from '../../features/legal/components/cookie-preferences-trigger';
import styles from './login-page.module.css';

function BrandMark() {
  return (
    <span className={styles.emblem}>
      <ArenaLogo size={32} className="text-[#10e760]" />
    </span>
  );
}

function LoginHeader() {
  return (
    <header className={styles.header}>
      <Link
        href="/"
        className={styles.brandLink}
        aria-label="SMASH ARENA — Trang chủ"
      >
        <BrandMark />
        <span className={styles.brandName}>
          SMASH ARENA<small>Pickleball Hub</small>
        </span>
      </Link>
      <Link href="/" className={styles.homeLink}>
        <LoginIcon name="back" />
        Trang chủ
      </Link>
    </header>
  );
}

function CardHeading() {
  return (
    <div className={styles.cardHeading}>
      <BrandMark />
      <p className={styles.brand}>SMASH ARENA</p>
      <h1 id="login-title">ĐĂNG NHẬP</h1>
      <p className={styles.description}>
        Chào mừng trở lại. Sân đấu đang chờ bạn.
      </p>
    </div>
  );
}

function LoginAlternatives() {
  const { openGuestConfirm } = useAuthActions();
  const [returnPath, setReturnPath] = useState('/');
  useEffect(() => setReturnPath(authReturnPath()), []);
  return (
    <>
      <div className={styles.divider}>
        <span>hoặc</span>
      </div>
      <button
        type="button"
        className={styles.guestButton}
        onClick={openGuestConfirm}
      >
        <LoginIcon name="eye" />
        <span>Tiếp tục không cần tài khoản</span>
      </button>
      <p className={styles.registerLink}>
        Chưa có tài khoản?{' '}
        <Link href={`/auth/register?next=${encodeURIComponent(returnPath)}`}>
          Đăng ký ngay
        </Link>
      </p>
    </>
  );
}

function LoginCard({ form }: { form: LoginFormState }) {
  return (
    <div className={styles.cardColumn}>
      <section className={styles.panel} aria-labelledby="login-title">
        <CardHeading />
        <LoginForm form={form} />
        <LoginAlternatives />
      </section>
      <Link href="/" className={styles.back}>
        Về trang chủ SMASH ARENA
      </Link>
    </div>
  );
}

function LoginFooter({
  paused,
  onToggle,
}: {
  paused: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <footer className={styles.footer}>
        <div>© 2026 SMASH ARENA. Nền tảng đặt sân Pickleball.</div>
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', justifyContent: 'center', flexWrap: 'wrap', fontSize: '0.8125rem' }}>
          <Link href="/privacy">Quyền riêng tư</Link>
          <Link href="/terms">Điều khoản</Link>
          <Link href="/cookies">Cookie</Link>
          <CookiePreferencesTrigger />
        </div>
      </footer>
      <button
        type="button"
        className={styles.motionControl}
        aria-pressed={paused}
        onClick={onToggle}
      >
        {paused ? 'Bật hiệu ứng nền' : 'Tạm dừng hiệu ứng nền'}
      </button>
    </>
  );
}

export function LoginScreen({ form }: { form: LoginFormState }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);
  return (
    <div className={styles.wrap}>
      <LoginWaveBackground paused={paused} />
      <LoginHeader />
      <main className={styles.main}>
        <LoginCard form={form} />
      </main>
      <LoginFooter paused={paused} onToggle={() => setPaused(!paused)} />
      {form.errorMessage && (
        <div id="login-error" className={styles.toast} role="alert">
          {form.errorMessage}
        </div>
      )}
      <GuestConfirmDialog onProceed={() => router.push(authReturnPath())} />
    </div>
  );
}
