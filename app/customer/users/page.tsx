'use client';

import { useCallback, useState } from 'react';
import { callApi } from '@/lib/apiClient';
import { getCustomer, listCustomerUsers } from '@/lib/queries';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
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

function roleLabel(role?: string | null) {
  return role === 'account_owner' ? 'Account owner' : 'Read only';
}

interface UsersData {
  customer: Customer | null;
  teammates: TeammateRow[];
}

async function fetchUsersData(context: CustomerPortalContext): Promise<UsersData> {
  try {
    const [customerResult, teammatesResult] = await Promise.all([
      getCustomer(context.customerId),
      listCustomerUsers(context.customerId),
    ]);
    return {
      customer: (customerResult.data as unknown as Customer) || null,
      teammates: (teammatesResult.data as TeammateRow[]) || [],
    };
  } catch {
    throw new Error('Could not load your team.');
  }
}

export default function CustomerTeamPage() {
  const {
    role,
    customerId,
    data,
    setData,
    loading,
    error: loadError,
  } = useCustomerPortalContext({ fetchData: fetchUsersData });
  const isAccountOwner = role === 'account_owner';
  const customer = data?.customer ?? null;
  const teammates = data?.teammates ?? [];

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const loadTeammates = useCallback(
    async (id: string) => {
      const { data: teammateData } = await listCustomerUsers(id);
      setData((prev) => (prev ? { ...prev, teammates: (teammateData as TeammateRow[]) || [] } : prev));
    },
    [setData]
  );

  const handleInvite = async () => {
    if (!email.trim()) {
      setInviteError('Email is required.');
      return;
    }
    setSending(true);
    setInviteError(null);
    setInviteSuccess(null);

    try {
      const payload = await callApi<{ emailSent?: boolean }>('/api/customer/invite-user', {
        email: email.trim(),
        name: name.trim() || undefined,
      });
      setInviteSuccess(
        payload?.emailSent
          ? `Invited ${email.trim()} — they'll receive an email with a temporary password.`
          : `Added ${email.trim()} to your team, but the invitation email could not be sent. Ask them to use "Forgot password" to get access, or contact support.`
      );
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
        <Card
          className={styles.inviteCard}
          title="Invite a teammate"
          subtitle="They'll get a login in the customer group with read-only access to your routes and invoices."
        >
          <div className={styles.form}>
            {inviteError && (
              <div className={styles.errorBanner} role="alert" aria-live="assertive">
                {inviteError}
              </div>
            )}
            {inviteSuccess && (
              <div className={styles.successBanner} role="status" aria-live="polite">
                {inviteSuccess}
              </div>
            )}
            <div className={styles.inviteForm}>
              <Field
                label="Email"
                htmlFor="invite-email"
                className={styles.inviteField}
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
              <Field label="Display Name" htmlFor="invite-name" className={styles.inviteField}>
                <Input
                  id="invite-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={sending}
                  placeholder="Display name (optional)"
                />
              </Field>
              <Button
                type="button"
                iconLeft="plus"
                loading={sending}
                disabled={sending || !email.trim()}
                onClick={() => void handleInvite()}
              >
                {sending ? 'Sending...' : 'Send invite'}
              </Button>
            </div>
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
