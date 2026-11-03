import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import '../components/arena/homepage-draft.css';
import '../components/arena/arena.css';
import '../components/arena/arena-booking.css';
import '../components/arena/arena-tickets.css';
import { AuthProvider } from '../context/auth-context';
import { ThemeProvider } from '../context/theme-context';
import { CookiePreferencesProvider } from '../features/cookie-consent/components/cookie-preferences-provider';
import { ChatWidget } from '../features/ai-assistant/components/ChatWidget';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-inter',
  display: 'swap',
});

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'vietnamese'],
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'SMASH ARENA | Dịch vụ Pickleball',
  description:
    'Đặt sân Pickleball, kiểm tra lịch và quản lý lịch đặt tại các cơ sở.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${inter.variable} ${jakarta.variable}`}
      suppressHydrationWarning
    >
      <body>
        <Script id="theme-preference" strategy="beforeInteractive">
          {`try { const saved = localStorage.getItem('smash-arena-theme'); const t = saved === 'light' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; document.documentElement.classList.add(t); document.documentElement.style.colorScheme = t; } catch { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('dark'); }`}
        </Script>
        <ThemeProvider>
          <AuthProvider>
            <CookiePreferencesProvider>
              {children}
              <ChatWidget />
            </CookiePreferencesProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
