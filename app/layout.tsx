'use client';

import './globals.css';
import '@aws-amplify/ui-react/styles.css';
import 'leaflet/dist/leaflet.css';
import { JetBrains_Mono, Inter } from 'next/font/google';
import { Authenticator } from '@aws-amplify/ui-react';
import { configureAmplify } from '@/lib/amplify-config';
import ErrorBoundary from '@/app/components/ErrorBoundary';

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
          <Authenticator.Provider>
            <Authenticator
              hideSignUp={false}
              formFields={{
                signUp: {
                  given_name: {
                    order: 1,
                    label: 'First Name',
                    placeholder: 'Enter your first name',
                    isRequired: true,
                  },
                  email: {
                    order: 2,
                  },
                  password: {
                    order: 3,
                  },
                  confirm_password: {
                    order: 4,
                  },
                },
              }}
              components={{
                SignUp: {
                  Header() {
                    return (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <h2 style={{ margin: 0 }}>Request Access</h2>
                        <p style={{ marginTop: '0.4rem', opacity: 0.8 }}>
                          New accounts require administrator approval before portal access is granted.
                        </p>
                      </div>
                    );
                  },
                },
              }}
            >
              {children}
            </Authenticator>
          </Authenticator.Provider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
