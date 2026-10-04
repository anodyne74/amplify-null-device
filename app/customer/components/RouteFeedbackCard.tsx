'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Input } from '@/app/components/ui/forms/Input';
import { callApi } from '@/lib/apiClient';
import type { RouteFeedbackTone } from '@/lib/routeFeedback';
import styles from './RouteFeedbackCard.module.css';

export interface RouteFeedbackValue {
  tone: RouteFeedbackTone;
  note: string;
}

interface RouteFeedbackCardProps {
  routeId: string;
  /** The feedback already given on this Route, if any. */
  feedback?: RouteFeedbackValue | null;
  onSaved: (feedback: RouteFeedbackValue) => void;
}

function describe(feedback: RouteFeedbackValue) {
  return feedback.tone === 'good' ? 'You said: All good' : `You said: Something was off — “${feedback.note}”`;
}

/**
 * Route Feedback (CONTEXT.md) on a completed Route. All good is saved in one
 * click; Something was off asks what. It can be changed until the Route is
 * invoiced, which only the server can tell (a read-only customer user can't
 * read Invoices), so the card asks first. After that it shows the feedback
 * read-only, or nothing if none was given.
 */
export default function RouteFeedbackCard({ routeId, feedback, onSaved }: RouteFeedbackCardProps) {
  const [locked, setLocked] = useState<string | null | undefined>(undefined);
  const [current, setCurrent] = useState<RouteFeedbackValue | null>(feedback ?? null);
  const [askingWhat, setAskingWhat] = useState(false);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let cancelled = false;
    callApi<{ locked: string | null }>('/api/customer/route-feedback/status', { routeId })
      .then((result) => {
        if (!cancelled) setLocked(result.locked);
      })
      // If the check fails, let the customer try: the server refuses anything it shouldn't take.
      .catch(() => {
        if (!cancelled) setLocked(null);
      });
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  const send = async (next: RouteFeedbackValue) => {
    setSending(true);
    setError(null);
    setSent(false);
    try {
      await callApi('/api/customer/route-feedback', { routeId, tone: next.tone, note: next.note });
      setCurrent(next);
      setAskingWhat(false);
      setNote('');
      setSent(true);
      onSaved(next);
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : 'Could not send your feedback.');
    } finally {
      setSending(false);
    }
  };

  if (locked && !current) return null;

  return (
    <Card title="How did this route go?" subtitle="Only asked once the route is complete">
      <div className={styles.form}>
        {current && <p className={styles.current}>{describe(current)}</p>}
        {sent && <p className="nd-badge nd-badge--success">Thanks — your feedback was sent.</p>}
        {error && <p className="nd-badge nd-badge--danger">{error}</p>}

        {locked ? (
          <p className={styles.locked}>{locked}</p>
        ) : (
          <>
            <div className={styles.actions}>
              <Button
                type="button"
                variant={current?.tone === 'good' && !askingWhat ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => void send({ tone: 'good', note: '' })}
                disabled={sending || locked === undefined}
              >
                All good
              </Button>
              <Button
                type="button"
                variant={askingWhat || current?.tone === 'issue' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setAskingWhat(true);
                  setNote(current?.tone === 'issue' ? current.note : '');
                }}
                disabled={sending || locked === undefined}
              >
                Something was off
              </Button>
            </div>

            {askingWhat && (
              <>
                <Input
                  multiline
                  aria-label="What was off?"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Two signs at 5 Kent St were facing the wrong way"
                  disabled={sending}
                />
                <div className={styles.actions}>
                  <Button
                    type="button"
                    size="sm"
                    loading={sending}
                    disabled={sending || !note.trim()}
                    onClick={() => void send({ tone: 'issue', note: note.trim() })}
                  >
                    {sending ? 'Sending…' : 'Send feedback'}
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
