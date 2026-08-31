'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/app/components/ui/core/Badge';
import { PhaseTrackBar } from './PhaseTrackBar';
import { parseRouteInstructions, sortRouteInstructionsNewestFirst } from '@/lib/routeInstructions';
import type { SignRunPhaseInfo } from '@/lib/signRunPhase';
import type { Route } from '@/amplify/types';
import styles from './SignRunRouteCard.module.css';

export interface SignRunRouteCardProps {
  route: Route;
  customerName?: string;
  phaseInfo: SignRunPhaseInfo;
  stopCount: number;
  signsTotal: number;
}

/**
 * The redesigned Today-screen route card from the Driver Sign Run design
 * handoff, for drivingModeEnabled routes only — see lib/signRunPhase.ts for
 * how phaseInfo is derived. Non-drivingMode routes keep the plain trackerCard
 * in app/operator/dashboard/page.tsx.
 *
 * TODO(sign-run): Load/Placement/Pickup (phaseIdx 0-2) now route to their own
 * screens. Once Unload/Finalise pages exist, route those phases too instead
 * of falling back to routes/detail.
 */
export function SignRunRouteCard({ route, customerName, phaseInfo, stopCount, signsTotal }: SignRunRouteCardProps) {
  const href =
    phaseInfo.phaseIdx === 0
      ? `/operator/routes/load?id=${route.id}`
      : phaseInfo.phaseIdx === 1
      ? `/operator/routes/placement?id=${route.id}`
      : phaseInfo.phaseIdx === 2
      ? `/operator/routes/pickup?id=${route.id}`
      : `/operator/routes/detail?id=${route.id}`;
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const instructionEntries = sortRouteInstructionsNewestFirst(parseRouteInstructions(route.customerInstructions));
  const hasNotes = instructionEntries.length > 0;
  // Instructions matter while driving stops — not at the yard — so the
  // section only appears on the placement and pickup phases.
  const showInstructions = hasNotes && (phaseInfo.phaseIdx === 1 || phaseInfo.phaseIdx === 2);

  const body = (
    <div className={styles.mainContent}>
      <div className={styles.topRow}>
        <span className={`${styles.phasePill} ${phaseInfo.tint === 'violet' ? styles.phasePillViolet : styles.phasePillIndigo}`}>
          {phaseInfo.phaseLabel}
        </span>
        {hasNotes && (
          <Badge tone="warning" size="sm" dot>
            Notes
          </Badge>
        )}
        <span className={styles.spacer} />
        <span className={styles.statusLabel}>{phaseInfo.statusLabel}</span>
      </div>

      <div className={styles.titleRow}>
        <strong className={styles.code}>{route.routeCode || route.id.slice(0, 8)}</strong>
        <span className={styles.customer}>{customerName}</span>
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaText}>{stopCount} stops</span>
        <span className={styles.metaText}>{signsTotal} signs</span>
        <span className={styles.spacer} />
        {!phaseInfo.isLocked && <span className={styles.cta}>{phaseInfo.actionLabel} →</span>}
      </div>

      <PhaseTrackBar track={phaseInfo.track} caption={phaseInfo.phaseNumberLabel} />

      {phaseInfo.isLocked && <div className={styles.lockNote}>{phaseInfo.lockNote}</div>}
    </div>
  );

  return (
    <div className={styles.card}>
      {phaseInfo.isLocked ? (
        <div className={styles.mainContentWrap}>{body}</div>
      ) : (
        <Link href={href} className={styles.mainContentWrap}>
          {body}
        </Link>
      )}

      {showInstructions && (
        <div className={styles.instructionsSection}>
          <button
            type="button"
            onClick={() => setInstructionsOpen((open) => !open)}
            className={styles.instructionsToggle}
          >
            <span className={styles.instructionsLabel}>Special instructions</span>
            <span className={styles.instructionsChevron}>{instructionsOpen ? 'Hide' : 'Show'}</span>
          </button>
          {instructionsOpen && (
            <div className={styles.instructionsBody}>
              {instructionEntries.map((entry, i) => (
                <p key={i} className={styles.instructionEntry}>
                  {entry.text}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
