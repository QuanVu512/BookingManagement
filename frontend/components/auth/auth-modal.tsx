'use client';

import { useAuthActions, useAuthDialog } from '../../context/auth-context';
import { useAuthForm } from '../../hooks/use-auth-form';
import { AUTH_LIMITS } from '../../lib/auth-validation';
import {
  AuthField,
  PasswordField,
  RegistrationFields,
} from './auth-form-fields';
import styles from './auth-modal.module.css';

export function AuthModal() {
  const { isAuthModalOpen } = useAuthDialog();
  return isAuthModalOpen ? <AuthModalDialog /> : null;
}

function AuthModalDialog() {
  const { closeAuthModal, openGuestConfirm } = useAuthActions();
  const { pendingCourt } = useAuthDialog();
  const form = useAuthForm();
  const isRegistration = form.mode === 'register';
  return (
    <div className="modal-overlay" onClick={closeAuthModal}>
      <div
        className={`modal-content ${styles.dialog}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-dialog-title"
      >
        <div className={`modal-header ${styles.header}`}>
          <div>
            <span className="badge badge-standard">SMASH ARENA AUTH</span>
            <h2 id="auth-dialog-title" className={styles.title}>
              {isRegistration ? 'Đăng ký tài khoản' : 'Đăng nhập'}
            </h2>
            {pendingCourt && (
              <p className={styles.pendingCourt}>
                Đang chọn: <strong>{pendingCourt.name}</strong> • Mã{' '}
                {pendingCourt.code}
              </p>
            )}
          </div>
          <button
            type="button"
            className="modal-close"
            onClick={closeAuthModal}
            aria-label="Đóng popup"
          >
            ✕
          </button>
        </div>
        <div className={styles.tabs}>
          <button
            type="button"
            aria-pressed={!isRegistration}
            disabled={form.isSubmitting}
            onClick={() => form.changeMode('login')}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            aria-pressed={isRegistration}
            disabled={form.isSubmitting}
            onClick={() => form.changeMode('register')}
          >
            Đăng ký mới
          </button>
        </div>
        <div className={`modal-body ${styles.body}`}>
          {form.errorMessage && (
            <div className={styles.error} role="alert">
              {form.errorMessage}
            </div>
          )}
          {form.successMessage && <p role="status">{form.successMessage}</p>}
          <form
            onSubmit={form.handleSubmit}
            noValidate
            aria-busy={form.isSubmitting}
          >
            <fieldset disabled={form.isSubmitting} className={styles.fields}>
              <AuthField
                name="username"
                label={
                  isRegistration
                    ? 'Tên đăng nhập'
                    : 'Tên đăng nhập, email hoặc số điện thoại'
                }
                placeholder={
                  isRegistration
                    ? 'Tên đăng nhập'
                    : 'Tên đăng nhập / email / SĐT'
                }
                value={form.values.username}
                error={form.errors.username}
                autoComplete="username"
                autoFocus
                maxLength={
                  isRegistration
                    ? AUTH_LIMITS.usernameMax
                    : AUTH_LIMITS.identifierMax
                }
                onChange={form.setField}
              />
              {isRegistration && (
                <RegistrationFields
                  values={form.values}
                  errors={form.errors}
                  setField={form.setField}
                />
              )}
              {form.capsLock && (
                <div
                  className={styles.warning}
                  role="status"
                  aria-live="polite"
                >
                  {form.capsLock && <p>Caps Lock đang bật.</p>}
                </div>
              )}
              <PasswordField
                name="password"
                label="Mật khẩu"
                placeholder="Mật khẩu"
                value={form.values.password}
                error={form.errors.password}
                onChange={form.setField}
                setCapsLock={form.setCapsLock}
                isRegistration={isRegistration}
              />
              {isRegistration && (
                <>
                  <PasswordField
                    name="confirmPassword"
                    label="Xác nhận mật khẩu"
                    placeholder="Nhập lại mật khẩu"
                    value={form.values.confirmPassword}
                    error={form.errors.confirmPassword}
                    onChange={form.setField}
                    setCapsLock={form.setCapsLock}
                    isRegistration
                  />
                </>
              )}
            </fieldset>
            <button
              type="submit"
              className={`btn btn-primary ${styles.submit}`}
              disabled={form.isSubmitting}
              aria-busy={form.isSubmitting}
            >
              {form.isSubmitting && (
                <span className={styles.spinner} aria-hidden="true" />
              )}
              {form.isSubmitting
                ? 'Đang xử lý...'
                : isRegistration
                  ? 'Tạo tài khoản và xác minh email'
                  : 'Đăng nhập và tiếp tục'}
            </button>
          </form>
          <p>
            <a href="/auth/forgot-password">Quên mật khẩu?</a> ·{' '}
            <a href="/auth/resend-verification">Gửi lại email xác minh</a>
          </p>
          <div className={styles.divider}>HOẶC</div>
          <button
            type="button"
            className={`btn btn-secondary ${styles.guest}`}
            onClick={openGuestConfirm}
          >
            Tiếp tục không cần tài khoản
          </button>
        </div>
      </div>
    </div>
  );
}
