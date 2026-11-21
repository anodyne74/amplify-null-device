'use client';

import { Suspense } from 'react';
import OperatorPickupPage from '@/app/operator/routes/pickup/page';
import { FixtureSwitcher } from '../FixtureSwitcher';

export function PickupPreview() {
  return (
    <Suspense>
      <FixtureSwitcher />
      <OperatorPickupPage />
    </Suspense>
  );
}
