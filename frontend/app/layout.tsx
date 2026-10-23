import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import '../components/arena/arena.css';
import '../components/arena/arena-booking.css';
import '../components/arena/arena-tickets.css';
import { AuthProvider } from '../context/auth-context';
import { ThemeProvider } from '../context/theme-context';

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
          {`try { const saved = localStorage.getItem('smash-arena-theme'); document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light'; document.documentElement.style.colorScheme = document.documentElement.dataset.theme; } catch { document.documentElement.dataset.theme = 'light'; }`}
        </Script>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
