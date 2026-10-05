'use client';

import { useCallback, useState } from 'react';
import { callApi } from '@/lib/apiClient';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { useFeatureFlags } from '@/lib/useFeatureFlags';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import type { Customer } from '@/amplify/types';
import styles from './page.module.css';
import { getCustomer, listCustomerUsers } from '@/lib/customers';

interface CustomerUserRow {
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
  users: CustomerUserRow[];
}

async function fetchUsersData(context: CustomerPortalContext): Promise<UsersData> {
  try {
    const [customer, users] = await Promise.all([
      getCustomer(context.customerId),
      listCustomerUsers(context.customerId),
    ]);
    return {
      customer: (customer as unknown as Customer) || null,
      users: users as CustomerUserRow[],
    };
  } catch {
    throw new Error('Could not load users.');
  }
}

export default function CustomerUsersPage() {
  const {
    role,
    customerId,
    data,
    setData,
    loading,
    error: loadError,
  } = useCustomerPortalContext({ fetchData: fetchUsersData });
  const isAccountOwner = role === 'account_owner';
  // account-owner-invite (#298): while off -- or still loading, or failed -- no
  // invite card or invite wording for anyone; the user list is unaffected.
  const inviteOn = useFeatureFlags().isOn('account-owner-invite');
  const customer = data?.customer ?? null;
  const users = data?.users ?? [];

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [sending, setSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  const loadUsers = useCallback(
    async (id: string) => {
      // Best-effort refresh after an invite: on failure the list stays as it was.
      const userData = await listCustomerUsers(id).catch(() => null);
      if (!userData) return;
      setData((prev) => (prev ? { ...prev, users: userData as CustomerUserRow[] } : prev));
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
          : `Added ${email.trim()} as a user, but the invitation email could not be sent. Ask them to use "Forgot password" to get access, or contact support.`
      );
      setEmail('');
      setName('');
      if (customerId) await loadUsers(customerId);
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
        <PageHeader title="Users" />
        <p className={styles.text}>Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle={
          inviteOn ? "Invite people from your company to your portal." : "People with access to your company's portal."
        }
      />

      {loadError && <div className={styles.errorBanner} role="alert">{loadError}</div>}

      {!inviteOn ? null : isAccountOwner ? (
        <Card
          className={styles.inviteCard}
          title="Invite a user"
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
                  placeholder="name@company.com"
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
          <p className={styles.text}>Only your account owner can invite users.</p>
        </Card>
      )}

      <Card className={styles.listCard}>
        <h2 className={styles.cardTitle}>Users on this account</h2>
        {users.length === 0 ? (
          <p className={styles.text}>No users yet.</p>
        ) : (
          <div className={styles.list}>
            {users.map((row) => (
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
