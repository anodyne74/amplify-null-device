'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/app/components/ui/core/Badge';
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
 * TODO(sign-run): once the Load/Placement/Pickup/Unload/Finalise pages exist,
 * route the card to the phase-specific screen instead of always opening
 * routes/detail.
 */
export function SignRunRouteCard({ route, customerName, phaseInfo, stopCount, signsTotal }: SignRunRouteCardProps) {
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

      <div className={styles.track}>
        <div className={styles.trackBar}>
          {phaseInfo.track.map((state, i) => (
            <span key={i} className={`${styles.trackSegment} ${styles[`trackSegment_${state}`]}`} />
          ))}
        </div>
        <div className={styles.trackCaption}>{phaseInfo.phaseNumberLabel}</div>
      </div>

      {phaseInfo.isLocked && <div className={styles.lockNote}>{phaseInfo.lockNote}</div>}
    </div>
  );

  return (
    <div className={styles.card}>
      {phaseInfo.isLocked ? (
        <div className={styles.mainContentWrap}>{body}</div>
      ) : (
        <Link href={`/operator/routes/detail?id=${route.id}`} className={styles.mainContentWrap}>
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
