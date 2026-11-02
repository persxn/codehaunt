import type { ReactNode } from 'react';

import { loadConfig } from '@/lib/config';

import './globals.css';

loadConfig();

export const metadata = { title: 'CodeHaunt' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
