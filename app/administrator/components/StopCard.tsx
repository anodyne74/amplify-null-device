'use client';

import type { DragEvent, ReactNode } from 'react';
import { AgentBadge } from '@/app/components/ui/core/AgentBadge';
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
  agentName: string;
  isAuction?: boolean;
  isTop?: boolean;
  isCompleted?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (event: DragEvent<HTMLDivElement>) => void;
  onDragLeave?: () => void;
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
  agentName,
  isAuction = false,
  isTop = false,
  isCompleted = false,
  isDragging = false,
  isDropTarget = false,
  draggable = false,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  actions,
}: StopCardProps) {
  const svcKey = serviceType || 'delivery';

  return (
    <div
      className={`${styles.card} ${SERVICE_TYPE_CLASS[svcKey] ?? ''} ${isTop ? styles.cardTop : ''} ${isCompleted ? styles.cardCompleted : ''} ${isDragging ? styles.cardDragging : ''} ${isDropTarget ? styles.cardDropTarget : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      <div className={`${styles.sequenceCircle} ${SERVICE_TYPE_CIRCLE_CLASS[svcKey] ?? ''}`}>{sequence}</div>

      <div className={styles.body}>
        <div className={styles.address}>{address}</div>
        <div className={styles.status}>{statusLabel}</div>
        {isAuction && <span className={styles.auctionBadge}>Auction</span>}
      </div>

      <AgentBadge agentName={agentName} size="sm" />

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
