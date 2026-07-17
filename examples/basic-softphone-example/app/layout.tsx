import { Poppins } from 'next/font/google';
import './globals.css';

// DialStack brand typeface (see docs/src/css/custom.css)
const poppins = Poppins({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata = {
  title: 'DialStack basic softphone example',
  description: 'Minimal WebRTC softphone built directly on the headless @dialstack/sdk/webrtc core.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body>{children}</body>
    </html>
  );
}
