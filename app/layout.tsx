'use client';

import './globals.css';
import { useEffect } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { configureAmplify } from '@/lib/amplify-config';
import ErrorBoundary from '@/app/components/ErrorBoundary';

// Configure Amplify on client mount
configureAmplify();

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <Authenticator.Provider>
            <Authenticator>
              {children}
            </Authenticator>
          </Authenticator.Provider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
