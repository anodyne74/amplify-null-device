import dynamic from 'next/dynamic';

const AuthApp = dynamic(() => import('./components/AuthApp'), { ssr: false });
const DataApp = dynamic(() => import('./components/DataApp'), { ssr: false });

export default function Home() {
  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Amplify — Next.js (static)</h1>
      <p>Welcome — this project was migrated from Vite to Next.js with TypeScript.</p>
      <AuthApp />
      <DataApp />
    </div>
  );
}
