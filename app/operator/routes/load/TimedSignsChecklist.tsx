'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { Stop } from '@/amplify/types';
import type { LoadStopInput } from '@/lib/loadChange';
import { checklistAgents, checklistFromStops, toggleLoaded } from './timedSignChecklist';
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
  /** Every Stop on the Route, removed ones included. */
  stops: Stop[];
  customerAgents: Array<string | null>;
  /** Each saves a Load Change, returning why it was refused, if it was. */
  onRemove: (stopId: string) => string | null;
  onRestore: (stopId: string) => string | null;
  onAdd: (input: LoadStopInput) => string | null;
}

/** The rows follow the stops, so a property added or removed is saved; the
 * ticks are this screen's alone and never saved. */
export function TimedSignsChecklist({ stops, customerAgents, onRemove, onRestore, onAdd }: TimedSignsChecklistProps) {
  const [loadedIds, setLoadedIds] = useState<ReadonlySet<string>>(() => new Set());
  const properties = checklistFromStops(stops, loadedIds);
  const [changeError, setChangeError] = useState<string | null>(null);
  const [swipe, setSwipe] = useState<Swipe | null>(null);
  // A drag ends in a click on the same button; this swallows it.
  const swallowClick = useRef(false);
  const slideOutTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(slideOutTimer.current), []);
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState('');
  const [agent, setAgent] = useState('');
  const [numberOfSigns, setNumberOfSigns] = useState(1);
  const [isAuction, setIsAuction] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const onRoute = properties.filter((p) => !p.removed);
  const loadedCount = onRoute.filter((p) => p.loaded).length;
  const allLoaded = onRoute.length > 0 && loadedCount === onRoute.length;
  const agents = checklistAgents(stops, customerAgents);
  const canAdd = address.trim() !== '' && agent !== '' && numberOfSigns >= 1;

  const remove = (id: string) => setChangeError(onRemove(id));

  const restore = (id: string) => setChangeError(onRestore(id));

  const slideOut = (id: string) => {
    setSwipe({ id, x0: 0, dx: -420, dragging: false });
    slideOutTimer.current = setTimeout(() => {
      remove(id);
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
    setLoadedIds((current) => toggleLoaded(current, id));
  };

  const onKeyDown = (id: string) => (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(id);
    }
  };

  const openAdd = () => {
    setAddress('');
    setAgent('');
    setNumberOfSigns(1);
    setIsAuction(false);
    setAddError(null);
    setAdding(true);
  };

  const add = () => {
    if (!canAdd) return;
    const refused = onAdd({ address, agent, numberOfSigns, isAuction });
    setAddError(refused);
    if (!refused) setAdding(false);
  };

  return (
    <div className={styles.section}>
      <div className={styles.header}>
        <span className={styles.heading}>Properties · placement order</span>
        <span className={allLoaded ? styles.countDone : styles.count}>
          {loadedCount} of {onRoute.length} loaded
        </span>
      </div>

      {changeError && (
        <div className={styles.error} role="alert">
          {changeError}
        </div>
      )}

      <div className={styles.list}>
        {properties.map((property) => {
          const dx = swipe?.id === property.id ? swipe.dx : 0;
          const meta = [
            property.agent,
            `${property.timed} timed`,
            ...(property.blank > 0 ? [`${property.blank} blank`] : []),
            ...(property.addedAtLoad ? ['Added on the day'] : []),
            ...(property.loaded ? ['Loaded'] : []),
          ].join(' · ');
          if (property.removed) {
            return (
              <div key={property.id} className={styles.rowRemoved}>
                <span className={styles.seqRemoved} aria-hidden="true">
                  –
                </span>
                <span className={styles.rowBody}>
                  <span className={styles.address}>{property.address}</span>
                  <span className={styles.meta}>{property.agent} · Removed</span>
                </span>
                <button type="button" className={styles.restoreButton} onClick={() => restore(property.id)}>
                  Restore
                </button>
              </div>
            );
          }
          const sequence = onRoute.indexOf(property) + 1;
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
                  {sequence}
                </span>
                <span className={styles.rowBody}>
                  <span className={styles.address}>{property.address}</span>
                  <span className={styles.meta}>{meta}</span>
                </span>
              </button>
            </div>
          );
        })}
        {properties.length === 0 && <div className={styles.empty}>No properties on this run.</div>}
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
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Signs</span>
            <input
              className={styles.input}
              type="number"
              inputMode="numeric"
              min={1}
              value={numberOfSigns}
              onChange={(e) => setNumberOfSigns(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            />
          </label>
          <button
            type="button"
            aria-pressed={isAuction}
            className={isAuction ? styles.agentPicked : styles.agent}
            onClick={() => setIsAuction((current) => !current)}
          >
            Auction — every sign timed
          </button>
          {addError && (
            <div className={styles.error} role="alert">
              {addError}
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
        Tap to mark loaded · swipe left to remove. Ticks aren&apos;t saved; adding, removing or restoring a property is.
        Route order is set by an administrator.
      </p>
    </div>
  );
}
