'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAuthSession, signOut } from 'aws-amplify/auth';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Badge } from '@/app/components/ui/core/Badge';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import type { AccountRequest, CustomerUserRole } from '@/amplify/types';
import styles from './page.module.css';

interface CustomerOption {
  id: string;
  name: string;
}

async function callAccountRequestsApi(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) {
    throw new Error('No session token found. Please sign in again.');
  }

  const response = await fetch('/api/account-requests', {
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

export default function PendingApprovalPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [accountRequest, setAccountRequest] = useState<AccountRequest | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);

  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<CustomerUserRole>('read_only');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    callAccountRequestsApi('GET')
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
      const payload = await callAccountRequestsApi('POST', { customerId, role, name: name.trim() || undefined });
      setAccountRequest(payload.request);
    } catch {
      setError('Could not submit your request. Please try again.');
    }
    setSubmitting(false);
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
                : 'Request sent — nothing more to do'}
            </h1>
            <p className={styles.text}>
              {accountRequest.status === 'pending' &&
                "The account owner for this company has been notified. You'll get an email the moment your access is switched on."}
              {accountRequest.status === 'approved' &&
                'Your access has been switched on. Sign out and back in to pick it up.'}
              {accountRequest.status === 'rejected' &&
                (accountRequest.decisionNote || 'This request was not approved. Contact the company you requested access to for details.')}
            </p>
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
