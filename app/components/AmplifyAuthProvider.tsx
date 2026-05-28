'use client';

import { Authenticator } from '@aws-amplify/ui-react';
import { configureAmplify } from '@/lib/amplify-config';

configureAmplify();

export default function AmplifyAuthProvider({ children }: { children: React.ReactNode }) {
  return <Authenticator.Provider>{children}</Authenticator.Provider>;
}