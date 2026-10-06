'use client';

import Link from 'next/link';
import Breadcrumbs from '@/app/components/Breadcrumbs';
import shellStyles from './signRunShell.module.css';

/** The "no route id in the URL at all" state — identical across every phase screen. */
export function NoRouteSelected() {
  return (
    <div className={shellStyles.page}>
      <p className={shellStyles.mutedText}>No route selected.</p>
      <Link href="/operator/dashboard" className={shellStyles.backLink}>
        Back to Today
      </Link>
    </div>
  );
}

interface PhaseNotReadyProps {
  phaseLabel: string;
  message: string;
}

/** The "route loaded, but doesn't belong on this screen right now" state —
 * each screen resolves its own message text, this just wraps the shared shell. */
export function PhaseNotReady({ phaseLabel, message }: PhaseNotReadyProps) {
  return (
    <div className={shellStyles.page}>
      <Breadcrumbs items={[{ label: 'Today', href: '/operator/dashboard' }, { label: phaseLabel }]} />
      <p className={shellStyles.mutedText}>{message}</p>
      <Link href="/operator/dashboard" className={shellStyles.backLink}>
        Back to Today
      </Link>
    </div>
  );
}
