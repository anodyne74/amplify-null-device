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
      </div>

      <AgentBadge agentName={agentName} size="sm" />

      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
