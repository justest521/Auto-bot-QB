import { Noto_Sans_TC } from 'next/font/google';

const notoSansTC = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  preload: true,
});

export const metadata = { title: 'Quick Buy Line Bot' };

export default function RootLayout({ children }) {
  return (
    <html lang="zh-TW" className={notoSansTC.className}>
      <body>{children}</body>
    </html>
  );
}
