'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import OperatorPlacementPage from '@/app/operator/routes/placement/page';
import { FIXTURE_ROUTE_IDS } from '@/lib/devFixtures';

const LABELS: Record<(typeof FIXTURE_ROUTE_IDS)[number], string> = {
  'fixture-2': '2 Stops',
  'fixture-16': '16 Stops',
  'fixture-removed': '16 Stops, one removed',
};

function Switcher() {
  const current = useSearchParams().get('id');
  return (
    <nav aria-label="Fixture Routes" style={{ display: 'flex', gap: 12, padding: '8px 16px', fontSize: 12 }}>
      <strong>Fixture:</strong>
      {FIXTURE_ROUTE_IDS.map((id) => (
        <Link key={id} href={`/devpreview/placement?id=${id}`} aria-current={id === current ? 'page' : undefined}>
          {LABELS[id]}
        </Link>
      ))}
    </nav>
  );
}

export function PlacementPreview() {
  return (
    <Suspense>
      <Switcher />
      <OperatorPlacementPage />
    </Suspense>
  );
}
