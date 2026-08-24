'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getCustomerPortalContext } from '@/lib/queries';
import PageHeader from '@/app/customer/components/PageHeader';
import AsyncState from '@/app/components/AsyncState';
import { Card } from '@/app/components/ui/core/Card';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import styles from './page.module.css';

interface AccountRequestRow {
  id: string;
  email: string;
  name?: string | null;
  customerId: string;
  customerName?: string | null;
  role?: string | null;
  status?: string | null;
  requestedAt?: string | null;
  decidedAt?: string | null;
  decisionNote?: string | null;
}

async function callApi(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) throw new Error('No session token found. Please sign in again.');

  const response = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || 'Request failed.');
  return payload;
}

function formatDate(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRole(role?: string | null) {
  return role === 'account_owner' ? 'Account owner' : 'Read only';
}

export default function AccountRequestsQueuePage() {
  const { user } = useAuthenticator();
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('read_only');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<AccountRequestRow[]>([]);
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejectNoteId, setRejectNoteId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await callApi('/api/account-requests/queue', 'GET');
      setRequests((payload.requests as AccountRequestRow[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load requests.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!user?.userId) return;
    void getCustomerPortalContext(user.userId).then((ctx) => setCustomerRole(ctx.role));
  }, [user?.userId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleApprove = async (id: string) => {
    setDecidingId(id);
    setActionError(null);
    try {
      await callApi('/api/account-requests/decide', 'POST', { requestId: id, decision: 'approve' });
      await loadRequests();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not approve this request.');
    }
    setDecidingId(null);
  };

  const handleReject = async (id: string) => {
    setDecidingId(id);
    setActionError(null);
    try {
      await callApi('/api/account-requests/decide', 'POST', { requestId: id, decision: 'reject', note: rejectNote });
      setRejectNoteId(null);
      setRejectNote('');
      await loadRequests();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Could not reject this request.');
    }
    setDecidingId(null);
  };

  const pending = requests.filter((r) => r.status === 'pending');
  const decided = requests.filter((r) => r.status !== 'pending');

  if (!loading && customerRole !== 'account_owner') {
    return (
      <div>
        <PageHeader title="Team Requests" />
        <Card className={styles.deniedCard}>
          <p>Only the account owner for your company can review access requests.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Team Requests" subtitle="People who've asked to join your company on NullDevice." />
      <AsyncState loading={loading} error={error} onRetry={loadRequests}>
        {actionError && <p className={styles.actionError}>{actionError}</p>}

        {pending.length === 0 ? (
          <Card className={styles.emptyCard}>
            <p>No pending requests right now.</p>
          </Card>
        ) : (
          <div className={styles.list}>
            {pending.map((r) => (
              <Card key={r.id} className={styles.row}>
                <div className={styles.rowMain}>
                  <div>
                    <p className={styles.name}>{r.name || r.email}</p>
                    <p className={styles.meta}>
                      {r.email} · {formatRole(r.role)} · Requested {formatDate(r.requestedAt)}
                    </p>
                  </div>
                  <Badge tone="warning">Pending</Badge>
                </div>

                {rejectNoteId === r.id ? (
                  <div className={styles.rejectForm}>
                    <textarea
                      className={styles.textarea}
                      placeholder="Optional note for the requester"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      disabled={decidingId === r.id}
                    />
                    <div className={styles.rowActions}>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setRejectNoteId(null);
                          setRejectNote('');
                        }}
                        disabled={decidingId === r.id}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        loading={decidingId === r.id}
                        onClick={() => void handleReject(r.id)}
                      >
                        Confirm reject
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={styles.rowActions}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={decidingId === r.id}
                      onClick={() => setRejectNoteId(r.id)}
                    >
                      Reject
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      loading={decidingId === r.id}
                      disabled={decidingId === r.id}
                      onClick={() => void handleApprove(r.id)}
                    >
                      Approve
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}

        {decided.length > 0 && (
          <>
            <h2 className={styles.sectionHeading}>Past requests</h2>
            <div className={styles.list}>
              {decided.map((r) => (
                <Card key={r.id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <div>
                      <p className={styles.name}>{r.name || r.email}</p>
                      <p className={styles.meta}>
                        {r.email} · {formatRole(r.role)} · Decided {formatDate(r.decidedAt)}
                      </p>
                    </div>
                    <Badge tone={r.status === 'approved' ? 'success' : 'danger'}>
                      {r.status === 'approved' ? 'Approved' : 'Rejected'}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </AsyncState>
    </div>
  );
}
