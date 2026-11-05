'use client';

import { Suspense } from 'react';
import OperatorPlacementPage from '@/app/operator/routes/placement/page';
import { FixtureSwitcher } from '../FixtureSwitcher';

export function PlacementPreview() {
  return (
    <Suspense>
      <FixtureSwitcher />
      <OperatorPlacementPage />
    </Suspense>
  );
}
