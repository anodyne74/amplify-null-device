'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { fetchAuthSession } from 'aws-amplify/auth';
import { getCustomer, getCustomerPortalContext, listCustomerUsers } from '@/lib/queries';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import type { Customer } from '@/amplify/types';
import styles from './page.module.css';

interface TeammateRow {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string | null;
}

async function callInviteApi(email: string, name?: string) {
  const session = await fetchAuthSession();
  const idToken = session.tokens?.idToken?.toString();
  if (!idToken) throw new Error('No session token found. Please sign in again.');

  const response = await fetch('/api/customer/invite-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ email, name }),
  });

  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error || 'Failed to send invite.');
  return payload;
}

function roleLabel(role?: string | null) {
  return role === 'account_owner' ? 'Account owner' : 'Read only';
}

export default function CustomerTeamPage() {
  const { user } = useAuthenticator();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isAccountOwner, setIsAccountOwner] = useState(false);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [teammates, setTeammates] = useState<TeammateRow[]>([]);

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const loadTeammates = useCallback(async (id: string) => {
    const { data } = await listCustomerUsers(id);
    setTeammates((data as TeammateRow[]) || []);
  }, []);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
      .then(async (context) => {
        if (cancelled) return;
        setIsAccountOwner(context.role === 'account_owner');
        setCustomerId(context.customerId);

        if (!context.customerId) {
          setLoadError('Could not resolve your customer account.');
          setLoading(false);
          return;
        }

        const [customerResult] = await Promise.all([
          getCustomer(context.customerId),
          loadTeammates(context.customerId),
        ]);
        if (cancelled) return;
        setCustomer((customerResult.data as unknown as Customer) || null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load your team.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId, loadTeammates]);

  const handleInvite = async () => {
    if (!email.trim()) {
      setInviteError('Email is required.');
      return;
    }
    setSending(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      await callInviteApi(email.trim(), name.trim() || undefined);
      setInviteSuccess(`Invited ${email.trim()} — they'll receive an email with a temporary password.`);
      setEmail('');
      setName('');
      if (customerId) await loadTeammates(customerId);
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : 'Failed to send invite.');
    }

    setSending(false);
  };

  const requiredDomain = customer?.restrictInvitesToOwnDomain
    ? customer.email?.trim().toLowerCase().split('@')[1]
    : undefined;

  if (loading) {
    return (
      <div>
        <PageHeader title="Team" />
        <p className={styles.text}>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Team" subtitle="Invite teammates into your company's portal access." />

      {loadError && <div className={styles.errorBanner} role="alert">{loadError}</div>}

      {isAccountOwner ? (
        <Card className={styles.inviteCard}>
          <h2 className={styles.cardTitle}>Invite a teammate</h2>
          {inviteError && <div className={styles.errorBanner} role="alert" aria-live="assertive">{inviteError}</div>}
          {inviteSuccess && <div className={styles.successBanner} role="status" aria-live="polite">{inviteSuccess}</div>}
          <div className={styles.form}>
            <Field
              label="Email"
              htmlFor="invite-email"
              hint={requiredDomain ? `Must be an @${requiredDomain} address` : undefined}
            >
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={sending}
                placeholder="teammate@company.com"
              />
            </Field>
            <Field label="Name (optional)" htmlFor="invite-name">
              <Input
                id="invite-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={sending}
              />
            </Field>
            <Button type="button" loading={sending} disabled={sending} onClick={() => void handleInvite()}>
              Send invite
            </Button>
          </div>
        </Card>
      ) : (
        <Card className={styles.inviteCard}>
          <p className={styles.text}>Only your account owner can invite teammates.</p>
        </Card>
      )}

      <Card className={styles.listCard}>
        <h2 className={styles.cardTitle}>Your team</h2>
        {teammates.length === 0 ? (
          <p className={styles.text}>No teammates yet.</p>
        ) : (
          <div className={styles.list}>
            {teammates.map((row) => (
              <div key={row.id} className={styles.listRow}>
                <div>
                  <div className={styles.listName}>{row.name || row.email || '—'}</div>
                  {row.name && row.email && <div className={styles.listEmail}>{row.email}</div>}
                </div>
                <span className={styles.listRole}>{roleLabel(row.role)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
