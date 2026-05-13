'use client';

import './globals.css';
import '@aws-amplify/ui-react/styles.css';
import 'leaflet/dist/leaflet.css';
import { JetBrains_Mono, Inter } from 'next/font/google';
import { Authenticator } from '@aws-amplify/ui-react';
import { configureAmplify } from '@/lib/amplify-config';
import ErrorBoundary from '@/app/components/ErrorBoundary';
import AmplifyThemeProvider from '@/app/components/AmplifyThemeProvider';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

// Configure Amplify on client mount
configureAmplify();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${inter.variable}`}>
      <body>
        <ErrorBoundary>
          <AmplifyThemeProvider>
            <Authenticator.Provider>
              {children}
            </Authenticator.Provider>
          </AmplifyThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
