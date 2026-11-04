import type { ReactNode } from 'react';

import { loadConfig } from '@/lib/config';

import '@fontsource/creepster/400.css';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/600.css';
import './tokens.css';
import './globals.css';

loadConfig();

export const metadata = {
  title: 'CodeHaunt',
  // Absolute URLs for the link-preview image (opengraph-image.jpg); the tunnel hostname unless PUBLIC_ORIGIN says otherwise.
  metadataBase: new URL(process.env.PUBLIC_ORIGIN || 'https://codehaunt.jojocode.in'),
};
// Every page renders per request: the CSP nonce (middleware.ts) differs each time, so nothing can be prerendered.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
