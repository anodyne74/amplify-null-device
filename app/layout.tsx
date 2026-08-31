import './globals.css';
import './components/ui/tokens.css';
import './components/ui/components.css';
import '@aws-amplify/ui-react/styles.css';
import 'leaflet/dist/leaflet.css';
import type { Viewport } from 'next';
import { JetBrains_Mono, Manrope, Comfortaa } from 'next/font/google';
import ErrorBoundary from '@/app/components/ErrorBoundary';
import AmplifyBootstrap from '@/app/components/AmplifyBootstrap';
import AmplifyAuthProvider from '@/app/components/AmplifyAuthProvider';
import AmplifyThemeProvider from '@/app/components/AmplifyThemeProvider';
import ToastProvider from '@/app/components/ToastProvider';

// Lets env(safe-area-inset-*) resolve to real values on notched/home-indicator
// devices instead of 0px — see PortalLayout.module.css's .main for the actual
// safe-area padding this enables.
export const viewport: Viewport = {
  viewportFit: 'cover',
};

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

const comfortaa = Comfortaa({
  subsets: ['latin'],
  variable: '--font-comfortaa',
  weight: ['400', '700'],
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${manrope.variable} ${comfortaa.variable}`}>
      <body>
        <ErrorBoundary>
          <AmplifyBootstrap>
            <AmplifyThemeProvider>
              <AmplifyAuthProvider>
                <ToastProvider>
                  {children}
                </ToastProvider>
              </AmplifyAuthProvider>
            </AmplifyThemeProvider>
          </AmplifyBootstrap>
        </ErrorBoundary>
      </body>
    </html>
  );
}
