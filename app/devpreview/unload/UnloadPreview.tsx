'use client';

import { Suspense } from 'react';
import OperatorUnloadPage from '@/app/operator/routes/unload/page';
import { FixtureSwitcher } from '../FixtureSwitcher';

export function UnloadPreview() {
  return (
    <Suspense>
      <FixtureSwitcher />
      <OperatorUnloadPage />
    </Suspense>
  );
}
