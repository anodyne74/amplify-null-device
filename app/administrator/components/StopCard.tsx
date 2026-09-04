'use client';

import type { DragEvent, ReactNode } from 'react';
import styles from './StopCard.module.css';

const SERVICE_TYPE_CLASS: Record<string, string> = {
  delivery: styles.cardDelivery,
  pickup: styles.cardPickup,
  inspection: styles.cardInspection,
};

const SERVICE_TYPE_CIRCLE_CLASS: Record<string, string> = {
  delivery: styles.circleDelivery,
  pickup: styles.circlePickup,
  inspection: styles.circleInspection,
};

interface StopCardProps {
  sequence: number | string;
  serviceType?: string | null;
  address: string;
  statusLabel: string;
  agentInitials: string;
  agentName: string;
  agentBadgeTone: { backgroundColor: string; color: string };
  isAuction?: boolean;
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
  serviceType,
  address,
  statusLabel,
  agentInitials,
  agentName,
  agentBadgeTone,
  isAuction = false,
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
  const svcKey = serviceType || 'delivery';

  return (
    <div
      className={`${styles.card} ${SERVICE_TYPE_CLASS[svcKey] ?? ''} ${isTop ? styles.cardTop : ''} ${isCompleted ? styles.cardCompleted : ''} ${isDragging ? styles.cardDragging : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={`${styles.sequenceCircle} ${SERVICE_TYPE_CIRCLE_CLASS[svcKey] ?? ''}`}>{sequence}</div>

      <div className={styles.body}>
        <div className={styles.address}>{address}</div>
        <div className={styles.status}>{statusLabel}</div>
        {isAuction && <span className={styles.auctionBadge}>Auction</span>}
      </div>

      <span
        className={styles.agentBadge}
        aria-label={agentName}
        title={agentName}
        style={
          {
            '--nd-agent-badge-bg': agentBadgeTone.backgroundColor,
            '--nd-agent-badge-fg': agentBadgeTone.color,
          } as React.CSSProperties
        }
      >
        {agentInitials}
      </span>

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
