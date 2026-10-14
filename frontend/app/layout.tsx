import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';
import { AuthProvider } from '../context/auth-context';
import { ThemeProvider } from '../context/theme-context';

export const metadata: Metadata = {
  title: 'SMASH ARENA | Đặt sân Pickleball tại Phù Đổng',
  description:
    'Khám phá sân Pickleball tại Phù Đổng, xem tiện ích, chọn ngày thi đấu và kiểm tra lịch sân theo khung giờ.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <Script id="theme-preference" strategy="beforeInteractive">
          {`try { const saved = localStorage.getItem('smash-arena-theme'); document.documentElement.dataset.theme = saved === 'light' ? 'light' : 'dark'; document.documentElement.style.colorScheme = document.documentElement.dataset.theme; } catch { document.documentElement.dataset.theme = 'dark'; }`}
        </Script>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
