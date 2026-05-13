'use client';

import { useAuthenticator } from '@aws-amplify/ui-react';
import OperatorRoute from '@/app/components/OperatorRoute';
import OperatorMUILayout from '@/app/operator/mui-layout';
import { getUserDisplayName } from '@/lib/amplify-config';

/**
 * Operator Portal Layout
 * Uses Material UI components with NullDevice dark theme
 * Optimized for mobile-first field use
 */
export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuthenticator();
  const userDisplayName = user ? getUserDisplayName(user) ?? '' : '';

  return (
    <OperatorRoute>
      <OperatorMUILayout userEmail={userDisplayName} onLogout={signOut}>
        {children}
      </OperatorMUILayout>
    </OperatorRoute>
  );
}

