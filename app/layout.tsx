import './globals.css';
import '@aws-amplify/ui-react/styles.css';
import 'leaflet/dist/leaflet.css';
import { JetBrains_Mono, Inter, Comfortaa } from 'next/font/google';
import ErrorBoundary from '@/app/components/ErrorBoundary';
import AmplifyBootstrap from '@/app/components/AmplifyBootstrap';
import AmplifyAuthProvider from '@/app/components/AmplifyAuthProvider';
import AmplifyThemeProvider from '@/app/components/AmplifyThemeProvider';
import ToastProvider from '@/app/components/ToastProvider';

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

const comfortaa = Comfortaa({
  subsets: ['latin'],
  variable: '--font-comfortaa',
  weight: ['400', '700'],
  display: 'swap',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${inter.variable} ${comfortaa.variable}`}>
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
