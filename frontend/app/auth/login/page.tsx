import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { AuthPage } from '../../../components/auth/auth-page';

const loginFont = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-login',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Đăng nhập | SMASH ARENA',
};

export default function LoginPage() {
  return (
    <div className={loginFont.variable}>
      <AuthPage mode="login" />
    </div>
  );
}
