'use client';

import { useEffect, useReducer, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Stop } from '@/amplify/types';
import { checklistAgents, checklistFromStops, checklistReducer } from './timedSignChecklist';
import styles from './TimedSignsChecklist.module.css';

/** Past this far left, letting go removes the row. */
const SWIPE_REMOVE_PX = 110;
/** Under this far, a press is a tap. */
const TAP_SLOP_PX = 6;
/** Matches the row's slide-out transition. */
const SLIDE_OUT_MS = 200;

interface Swipe {
  id: string;
  x0: number;
  dx: number;
  dragging: boolean;
}

interface TimedSignsChecklistProps {
  stops: Stop[];
  customerAgents: Array<string | null>;
}

/** Checklist only — never saved. Seeded once from the stops; later stop
 * updates don't reset what the operator has ticked, removed or added. */
export function TimedSignsChecklist({ stops, customerAgents }: TimedSignsChecklistProps) {
  const [properties, dispatch] = useReducer(checklistReducer, stops, checklistFromStops);
  const [swipe, setSwipe] = useState<Swipe | null>(null);
  // A drag ends in a click on the same button; this swallows it.
  const swallowClick = useRef(false);
  const slideOutTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(slideOutTimer.current), []);
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState('');
  const [agent, setAgent] = useState('');

  const loadedCount = properties.filter((p) => p.loaded).length;
  const allLoaded = properties.length > 0 && loadedCount === properties.length;
  const agents = checklistAgents(stops, customerAgents);
  const canAdd = address.trim() !== '' && agent !== '';

  const slideOut = (id: string) => {
    setSwipe({ id, x0: 0, dx: -420, dragging: false });
    slideOutTimer.current = setTimeout(() => {
      dispatch({ type: 'remove', id });
      setSwipe(null);
    }, SLIDE_OUT_MS);
  };

  const onPointerDown = (id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    swallowClick.current = false;
    setSwipe({ id, x0: e.clientX, dx: 0, dragging: true });
  };

  const onPointerMove = (id: string) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!swipe || swipe.id !== id || !swipe.dragging) return;
    setSwipe({ ...swipe, dx: Math.min(0, e.clientX - swipe.x0) });
  };

  const onPointerUp = (id: string) => () => {
    if (!swipe || swipe.id !== id || !swipe.dragging) return;
    if (Math.abs(swipe.dx) >= TAP_SLOP_PX) swallowClick.current = true;
    if (swipe.dx < -SWIPE_REMOVE_PX) {
      slideOut(id);
    } else {
      setSwipe(null);
    }
  };

  const onClick = (id: string) => () => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    dispatch({ type: 'toggle', id });
  };

  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      dispatch({ type: 'remove', id });
    }
  };

  const openAdd = () => {
    setAddress('');
    setAgent('');
    setAdding(true);
  };

  const add = () => {
    if (!canAdd) return;
    dispatch({ type: 'add', id: `added-${Date.now()}`, address, agent });
    setAdding(false);
  };

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.heading}>Timed signs · placement order</span>
        <span className={allLoaded ? styles.countDone : styles.count}>
          {loadedCount} of {properties.length} loaded
        </span>
      </div>

      <div className={styles.list}>
        {properties.map((property, i) => {
          const dx = swipe?.id === property.id ? swipe.dx : 0;
          const meta = [
            property.agent,
            property.timed === null ? 'Added on the day' : `${property.timed} timed`,
            ...(property.loaded ? ['Loaded'] : []),
          ].join(' · ');
          return (
            <div key={property.id} className={styles.rowTrack}>
              <div className={styles.removeHint} aria-hidden="true">
                Remove
              </div>
              <button
                type="button"
                aria-pressed={property.loaded}
                className={property.loaded ? styles.rowLoaded : styles.row}
                style={{
                  transform: `translateX(${dx}px)`,
                  transition: swipe?.id === property.id && swipe.dragging ? 'none' : undefined,
                }}
                onPointerDown={onPointerDown(property.id)}
                onPointerMove={onPointerMove(property.id)}
                onPointerUp={onPointerUp(property.id)}
                onPointerCancel={() => setSwipe(null)}
                onClick={onClick(property.id)}
                onKeyDown={onKeyDown(property.id)}
              >
                <span className={property.loaded ? styles.seqLoaded : styles.seq} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.rowBody}>
                  <span className={styles.address}>{property.address}</span>
                  <span className={styles.meta}>{meta}</span>
                </span>
              </button>
            </div>
          );
        })}
        {properties.length === 0 && <div className={styles.empty}>No timed signs on this run.</div>}
      </div>

      {adding ? (
        <div className={styles.addCard}>
          <div className={styles.addTitle}>Add property</div>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Address</span>
            <input
              className={styles.input}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. 30 Faraday St, Carlton"
            />
          </label>
          {agents.length > 0 && (
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Agent</span>
              <div className={styles.agentGrid}>
                {agents.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={agent === name}
                    className={agent === name ? styles.agentPicked : styles.agent}
                    onClick={() => setAgent(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <button type="button" className={styles.addButton} disabled={!canAdd} onClick={add}>
            Add to end of list
          </button>
          <button type="button" className={styles.cancelButton} onClick={() => setAdding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={styles.openAddButton} onClick={openAdd}>
          Add property
        </button>
      )}

      <p className={styles.hint}>
        Tap to mark loaded · swipe left to remove. Checklist only — not recorded. Route order is set by an administrator.
      </p>
    </div>
  );
}
