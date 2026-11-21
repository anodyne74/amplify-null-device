'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Select } from '@/app/components/ui/forms/Select';
import { Dialog } from '@/app/components/ui/feedback/Dialog';
import { callApi } from '@/lib/apiClient';
import { assignOperator } from '@/lib/administratorRouteActions';
import { planOperatorAssignment, routeLabel } from '@/lib/routeListHelpers';
import type { Route } from '@/amplify/types';
import styles from './page.module.css';

type OperatorOption = { sub: string; name: string; email: string };

interface AssignOperatorDialogProps {
  routes: Route[];
  /** Every selected Route was handled; the list should clear its selection. */
  onDone: () => void;
  onClose: () => void;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Assigns one Operator to the selected Routes, one Route at a time. It sends no message: Notify Operator
 * stays a separate, deliberate action. */
export function AssignOperatorDialog({ routes, onDone, onClose }: AssignOperatorDialogProps) {
  const [operators, setOperators] = useState<OperatorOption[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [operatorSub, setOperatorSub] = useState('');
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<{ assigned: number; total: number; failed: Route[]; unaudited: Route[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    callApi<{ users?: Array<{ sub?: string; name?: string; email?: string }> }>('/api/admin/users', {
      action: 'listUsersInGroup',
      groupName: 'operator',
    })
      .then((result) => {
        if (cancelled) return;
        setOperators(
          (result.users || [])
            .filter((u): u is { sub: string; name: string; email: string } => Boolean(u.sub && u.email))
            .map((u) => ({ sub: u.sub, name: u.name || u.email, email: u.email }))
        );
      })
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // After a partial failure only the failed Routes are left to do.
  const pending = outcome ? outcome.failed : routes;
  const operator = operators?.find((candidate) => candidate.sub === operatorSub);
  const plan = useMemo(() => planOperatorAssignment(pending, operatorSub), [pending, operatorSub]);

  async function apply() {
    if (!operator) return;
    setWorking(true);
    const failed: Route[] = [];
    const unaudited: Route[] = [];
    for (const route of plan.eligible) {
      const result = await assignOperator(route, operator);
      if (result.ok) continue;
      if (result.saved) unaudited.push(route);
      else failed.push(route);
    }
    setWorking(false);
    const assigned = plan.eligible.length - failed.length;
    if (failed.length === 0 && unaudited.length === 0) {
      onDone();
      return;
    }
    setOutcome({ assigned, total: plan.eligible.length, failed, unaudited });
    if (failed.length === 0) setOperatorSub('');
  }

  const title = outcome ? 'Assignment result' : 'Assign Operator';
  const done = outcome !== null && outcome.failed.length === 0;

  return (
    <Dialog
      open
      title={title}
      description={outcome ? undefined : `${plural(routes.length, 'Route', 'Routes')} selected. Assigning sends no message.`}
      onClose={working ? undefined : onClose}
      footer={
        <>
          <Button variant="secondary" onClick={done ? onDone : onClose} disabled={working}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          {!done && (
            <Button variant="primary" onClick={() => void apply()} loading={working} disabled={!operator || plan.eligible.length === 0 || working}>
              {outcome ? 'Retry failed' : 'Assign'}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.assignBody}>
        {outcome && (
          <div role="status" className={styles.assignSummary}>
            <p>
              Assigned {outcome.assigned} of {outcome.total}
              {outcome.failed.length > 0 && `; ${outcome.failed.map(routeLabel).join(', ')} failed`}.
            </p>
            {outcome.unaudited.length > 0 && (
              <p>
                {outcome.unaudited.map(routeLabel).join(', ')} {outcome.unaudited.length === 1 ? 'was' : 'were'} assigned, but the
                audit entry could not be written.
              </p>
            )}
          </div>
        )}

        {!done && (
          <>
            <Field label="Operator" htmlFor="bulk-assign-operator">
              <Select
                id="bulk-assign-operator"
                value={operatorSub}
                disabled={operators === null && !loadFailed}
                onChange={(event) => setOperatorSub(event.target.value)}
              >
                <option value="">{loadFailed ? 'Operators could not be loaded' : operators === null ? 'Loading Operators…' : 'Select an Operator…'}</option>
                {operators?.map((candidate) => (
                  <option key={candidate.sub} value={candidate.sub}>
                    {candidate.name} ({candidate.email})
                  </option>
                ))}
              </Select>
            </Field>

            {operator && plan.overwrites.length > 0 && (
              <p className={styles.assignNote} role="status">
                This replaces the current Operator on {plan.overwrites.map((route) => `${routeLabel(route)} (${route.assignedOperatorName || route.assignedOperatorEmail})`).join(', ')}.
              </p>
            )}
            {operator && plan.finished.length > 0 && (
              <p className={styles.assignNote}>
                Skipped, because they are finished: {plan.finished.map(routeLabel).join(', ')}.
              </p>
            )}
            {operator && plan.alreadyAssigned.length > 0 && (
              <p className={styles.assignNote}>
                Skipped, because {operator.name} is already the Operator: {plan.alreadyAssigned.map(routeLabel).join(', ')}.
              </p>
            )}
            {operator && plan.eligible.length === 0 && (
              <p className={styles.assignNote} role="status">Nothing to assign.</p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
