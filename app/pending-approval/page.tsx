'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Badge } from '@/app/components/ui/core/Badge';
import { Icon } from '@/app/components/ui/core/Icon';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import type { AccountRequest, CustomerUserRole } from '@/amplify/types';
import styles from './page.module.css';

interface CustomerOption {
  id: string;
  name: string;
}

interface AccountRequestWithMeta extends AccountRequest {
  customerName?: string | null;
  accountOwnerName?: string | null;
}

async function callAccountRequestsApi(path: string, method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new Error('No session token found. Please sign in again.');
  }

  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || 'Request failed.');
  }
  return payload;
}

function getStatusLabel(status?: string | null) {
  if (status === 'approved') return 'Approved';
  if (status === 'rejected') return 'Not approved';
  return 'Waiting on approval';
}

function formatDateTime(value?: string | null) {
  if (!value) return null;
  return new Date(value).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

type TimelineStepState = 'done' | 'current' | 'upcoming' | 'stopped';

const TIMELINE_STEP_ICON: Record<TimelineStepState, string> = {
  done: 'check',
  current: 'timer',
  upcoming: 'key-round',
  stopped: 'x',
};

function TimelineStep({ state, title, detail }: { state: TimelineStepState; title: string; detail?: string | null }) {
  return (
    <div className={styles.timelineStep} data-state={state}>
      <span className={styles.timelineIcon} aria-hidden="true">
        <Icon name={TIMELINE_STEP_ICON[state]} size={14} strokeWidth={2} />
      </span>
      <div>
        <p className={styles.timelineTitle}>{title}</p>
        {detail && <p className={styles.timelineDetail}>{detail}</p>}
      </div>
    </div>
  );
}

function RequestTimeline({ request }: { request: AccountRequestWithMeta }) {
  const ownerLabel = request.accountOwnerName ? `by ${request.accountOwnerName}` : 'by the account owner';
  const isRejected = request.status === 'rejected';
  const isApproved = request.status === 'approved';

  return (
    <div className={styles.timeline}>
      <TimelineStep state="done" title="Request sent" detail={formatDateTime(request.requestedAt)} />
      <TimelineStep
        state={isRejected || isApproved ? 'done' : 'current'}
        title={`Reviewed ${ownerLabel}`}
        detail={formatDateTime(request.decidedAt) || (isApproved || isRejected ? undefined : 'Pending review')}
      />
      <TimelineStep
        state={isApproved ? 'done' : isRejected ? 'stopped' : 'upcoming'}
        title={isRejected ? 'Not approved' : 'Access granted'}
        detail={isApproved ? formatDateTime(request.decidedAt) : undefined}
      />
    </div>
  );
}

export default function PendingApprovalPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accountRequest, setAccountRequest] = useState<AccountRequestWithMeta | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<CustomerUserRole>('read_only');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    callAccountRequestsApi('/api/account-requests', 'GET')
      .then((payload) => {
        if (cancelled) return;
        setAccountRequest(payload.request);
        const customerList = (payload.customers as CustomerOption[]) || [];
        setCustomers(customerList);
        if (customerList.length > 0) setCustomerId(customerList[0].id);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your request. Please refresh and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const handleSubmit = async () => {
    if (!customerId) {
      setError('Select your company first.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = await callAccountRequestsApi('/api/account-requests', 'POST', {
        customerId,
        role,
        name: name.trim() || undefined,
      });
      setAccountRequest(payload.request);
    } catch {
      setError('Could not submit your request. Please try again.');
    }
    setSubmitting(false);
  };

  const handleChaseUp = async () => {
    setResending(true);
    setResendMessage(null);
    setResendError(null);
    try {
      const payload = await callAccountRequestsApi('/api/account-requests/resend', 'POST');
      setAccountRequest((prev) => (prev ? { ...prev, lastNotifiedAt: payload.request?.lastNotifiedAt } : prev));
      setResendMessage("We've nudged them again.");
    } catch (e) {
      setResendError(e instanceof Error ? e.message : 'Could not resend the notification.');
    }
    setResending(false);
  };

  return (
    <div className={styles.wrapper}>
      <Card className={styles.card}>
        {loading ? (
          <p className={styles.text}>Loading...</p>
        ) : accountRequest ? (
          <>
            <Badge tone={accountRequest.status === 'approved' ? 'success' : accountRequest.status === 'rejected' ? 'danger' : 'warning'}>
              {getStatusLabel(accountRequest.status)}
            </Badge>
            <h1 className={styles.heading}>
              {accountRequest.status === 'approved'
                ? 'Access is ready'
                : accountRequest.status === 'rejected'
                ? 'Request not approved'
                : 'Request sent'}
            </h1>
            <p className={styles.text}>
              {accountRequest.status === 'pending' &&
                `${accountRequest.accountOwnerName || 'The account owner'} for ${accountRequest.customerName || 'this company'} has been notified. You'll get an email the moment your access is switched on.`}
              {accountRequest.status === 'approved' &&
                'Your access has been switched on. Sign out and back in to pick it up.'}
              {accountRequest.status === 'rejected' &&
                (accountRequest.decisionNote || 'This request was not approved. Contact the company you requested access to for details.')}
            </p>

            <RequestTimeline request={accountRequest} />

            {accountRequest.status === 'pending' && (
              <div className={styles.chaseUp}>
                {resendMessage && <p className={styles.resendMessage}>{resendMessage}</p>}
                {resendError && <p className={styles.resendError}>{resendError}</p>}
                <Button type="button" variant="ghost" size="sm" loading={resending} disabled={resending} onClick={() => void handleChaseUp()}>
                  Chase it up
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className={styles.heading}>Request access</h1>
            <p className={styles.text}>Tell us which company you&apos;re with and we&apos;ll notify their account owner.</p>
            {error && <p className="nd-badge nd-badge--danger">{error}</p>}
            <div className={styles.form}>
              <Field label="Your name" htmlFor="request-name">
                <Input id="request-name" value={name} onChange={(e) => setName(e.target.value)} disabled={submitting} />
              </Field>
              <Field label="Company" htmlFor="request-customer">
                <Select
                  id="request-customer"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  disabled={submitting || customers.length === 0}
                >
                  {customers.length === 0 && <option value="">No companies found</option>}
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Access level" htmlFor="request-role">
                <Select
                  id="request-role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as CustomerUserRole)}
                  disabled={submitting}
                >
                  <option value="read_only">Read only — view routes and stops</option>
                  <option value="account_owner">Account owner — billing and invoices too</option>
                </Select>
              </Field>
              <Button
                type="button"
                block
                loading={submitting}
                disabled={submitting || customers.length === 0}
                onClick={() => void handleSubmit()}
              >
                Send request
              </Button>
            </div>
          </>
        )}
        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => void handleSignOut()}>
            Sign Out
          </Button>
        </div>
      </Card>
    </div>
  );
}
