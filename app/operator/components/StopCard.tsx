'use client';

import type { DragEvent, ReactNode } from 'react';
import { AgentBadge } from '@/app/components/ui/core/AgentBadge';
import type { StopProgressTone } from '@/lib/stopStatusLabel';
import styles from './StopCard.module.css';

const TONE_CLASS: Record<StopProgressTone, string> = {
  awaiting: styles.cardAwaiting,
  placed: styles.cardPlaced,
  pickedUp: styles.cardPickedUp,
  couldntCollect: styles.cardCouldntCollect,
};

const TONE_CIRCLE_CLASS: Record<StopProgressTone, string> = {
  awaiting: styles.circleAwaiting,
  placed: styles.circlePlaced,
  pickedUp: styles.circlePickedUp,
  couldntCollect: styles.circleCouldntCollect,
};

interface StopCardProps {
  sequence: number | string;
  /** How far the stop has got (lib/stopStatusLabel.ts), which colours it. */
  tone: StopProgressTone;
  address: string;
  statusLabel: string;
  agentName: string;
  isTop?: boolean;
  isCompleted?: boolean;
  isDragging?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
  actions?: ReactNode;
}

/** A single stop row in the operator route-detail planning view (sequence, address, status, agent, actions). */
export default function StopCard({
  sequence,
  tone,
  address,
  statusLabel,
  agentName,
  isTop = false,
  isCompleted = false,
  isDragging = false,
  draggable = false,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  actions,
}: StopCardProps) {
  return (
    <div
      className={`${styles.card} ${TONE_CLASS[tone]} ${isTop ? styles.cardTop : ''} ${isCompleted ? styles.cardCompleted : ''} ${isDragging ? styles.cardDragging : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={`${styles.sequenceCircle} ${TONE_CIRCLE_CLASS[tone]}`}>{sequence}</div>

      <div className={styles.body}>
        <div className={styles.address}>{address}</div>
        <div className={styles.status}>{statusLabel}</div>
      </div>

      <AgentBadge agentName={agentName} size="sm" />

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
