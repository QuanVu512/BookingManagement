'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { authMessage } from '../services/auth';
import { isEmail } from '../lib/auth-validation';
import { EMAIL_OTP_PATTERN, emptyOtpDigits } from '../lib/email-otp';
import {
  readVerificationEmail,
  readVerificationFlow,
  clearVerificationFlow,
  rememberVerificationEmail,
} from '../lib/auth-navigation';

const RESEND_COOLDOWN_MS = 10_000;
const OTP_NOTICE_DURATION_MS = 4_000;

export function useEmailVerification() {
  const [email, setEmail] = useState('');
  const [digits, setDigits] = useState(emptyOtpDigits);
  const code = digits.join('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [verified, setVerified] = useState(false);
  const [noticeId, setNoticeId] = useState(0);
  const initialized = useRef(false);
  const mounted = useRef(false);
  const [availableAt, setAvailableAt] = useState(0);
  const remaining = useResendCountdown(availableAt);
  const locked = useRef(false);
  useEffect(() => {
    mounted.current = true;
    if (!initialized.current) {
      initialized.current = true;
      const flow = readVerificationFlow();
      setEmail(flow?.email ?? readVerificationEmail());
      if (flow) {
        locked.current = true;
        setBusy(true);
        void executeRequest('resend-verification', flow.email);
      }
    }
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!noticeId) return;
    const timer = setTimeout(() => setMessage(''), OTP_NOTICE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [noticeId]);

  async function request(endpoint: 'verify-email' | 'resend-verification') {
    if (locked.current || verified) return;
    if (endpoint === 'resend-verification' && remaining > 0) return;
    const normalizedEmail = email.trim().toLowerCase();
    const validation = !isEmail(normalizedEmail)
      ? 'Vui lòng nhập email hợp lệ.'
      : endpoint === 'verify-email' && !EMAIL_OTP_PATTERN.test(code)
        ? 'Mã xác minh phải gồm 6 chữ số.'
        : '';
    setError(validation);
    if (validation) return;
    locked.current = true;
    setBusy(true);
    setMessage('');
    await executeRequest(endpoint, normalizedEmail);
  }
  async function executeRequest(
    endpoint: 'verify-email' | 'resend-verification',
    normalizedEmail: string,
  ) {
    try {
      const result = await sendVerificationRequest(
        endpoint,
        normalizedEmail,
        code,
      );
      if (mounted.current)
        acceptResult(endpoint, normalizedEmail, result.message);
    } catch (failure: unknown) {
      if (mounted.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Chưa thể xử lý yêu cầu.',
        );
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function acceptResult(
    endpoint: 'verify-email' | 'resend-verification',
    normalizedEmail: string,
    resultMessage: string,
  ) {
    rememberVerificationEmail(normalizedEmail);
    setMessage(resultMessage);
    setDigits(emptyOtpDigits());
    if (endpoint === 'verify-email') {
      setVerified(true);
      setNoticeId(0);
      clearVerificationFlow();
      return;
    }
    setAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
    setNoticeId((previous) => previous + 1);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void request('verify-email');
  }
  return {
    email,
    setEmail,
    digits,
    setDigits,
    busy,
    error,
    message,
    noticeId,
    verified,
    remaining,
    submit,
    resend: () => void request('resend-verification'),
  };
}

function useResendCountdown(availableAt: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!availableAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [availableAt]);
  return Math.max(0, Math.ceil((availableAt - now) / 1000));
}

function sendVerificationRequest(
  endpoint: 'verify-email' | 'resend-verification',
  email: string,
  code: string,
) {
  if (endpoint === 'verify-email')
    return authMessage(endpoint, { email, code });
  const flow = readVerificationFlow();
  if (!flow) throw new Error('Vui lòng đăng nhập hoặc đăng ký để nhận mã OTP.');
  return authMessage(endpoint, { email, verificationToken: flow.token });
}
