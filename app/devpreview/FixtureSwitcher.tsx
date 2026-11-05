'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/** The fixtures each preview screen offers, and where each is shown. */
const FIXTURES: Array<{ id: string; label: string; screen: 'placement' | 'pickup' | 'unload' }> = [
  { id: 'fixture-2', label: 'Placement · 2 Stops', screen: 'placement' },
  { id: 'fixture-16', label: 'Placement · 16 Stops', screen: 'placement' },
  { id: 'fixture-removed', label: 'Placement · one removed', screen: 'placement' },
  { id: 'fixture-pickup', label: 'Pickup · 16 Stops', screen: 'pickup' },
  { id: 'fixture-unload', label: 'Unload', screen: 'unload' },
];

export function FixtureSwitcher() {
  const current = useSearchParams().get('id');
  return (
    <nav aria-label="Fixture Routes" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '8px 16px', fontSize: 12 }}>
      <strong>Fixture:</strong>
      {FIXTURES.map(({ id, label, screen }) => (
        <Link key={id} href={`/devpreview/${screen}?id=${id}`} aria-current={id === current ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
