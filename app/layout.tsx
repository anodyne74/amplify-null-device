import './globals.css';

export const metadata = {
  title: 'Amplify Next App',
  description: 'Migrated from Vite to Next.js (static export)'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
