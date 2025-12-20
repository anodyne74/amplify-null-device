"use client";
import Image from 'next/image';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import { Amplify } from 'aws-amplify';
import outputs from '../../amplify_outputs.json';

// Configure Amplify with outputs from Amplify backend
Amplify.configure(outputs);

export default function AuthApp() {
  return (
    <Authenticator
      loginMechanisms={["username"]}
      components={{
        SignIn: {
          Header() {
            return <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Sign in to access admin features</h2>;
          },
          Footer() {
            return null;
          },
        },
        SignUp: {
          Header() {
            return <h2 style={{ textAlign: 'center', marginBottom: '1rem' }}>Create an account</h2>;
          },
          Footer() {
            return null;
          },
        },
      }}
      hideSignUp={false}
    >
      {({ signOut, user }) => (
        <>
          <div>
            <a href="https://vite.dev" target="_blank" rel="noreferrer">
              <Image src="/vite.svg" className="logo" alt="Vite logo" width={96} height={96} />
            </a>
            <a href="https://react.dev" target="_blank" rel="noreferrer">
              <Image src="/react.svg" className="logo react" alt="React logo" width={96} height={96} />
            </a>
          </div>
          <h1>Google Map + AWS Cognito Login</h1>
          <div className="card">
            <button onClick={signOut}>Sign Out</button>
            <p>Welcome, {user?.username}!</p>
          </div>
          <div style={{ margin: '2rem 0', width: '100%', maxWidth: '900px', height: '70vh' }}>
            <iframe
              src="https://www.google.com/maps/d/embed?mid=1Lc2SbeXOsDN-vvG7irNuj2GHrVqN5CE&ehbc=2E312F"
              allowFullScreen={true}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={{ width: '100%', height: '100%', border: 'none', borderRadius: '12px' }}
              title="Google Map"
            />
          </div>
          <div className="admin-area" style={{ background: '#fff', padding: '2rem', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: '600px', margin: '2rem auto' }}>
            <h2>Admin Area</h2>
            <p>Only authenticated users can see this section.</p>
          </div>
        </>
      )}
    </Authenticator>
  );
}
