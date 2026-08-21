'use client';

import { useEffect, useState } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import type { Customer } from '@/amplify/types';
import { getCustomer, getCustomerPortalContext, updateCustomer } from '@/lib/queries';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import PageHeader from '@/app/customer/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Switch } from '@/app/components/ui/forms/Switch';
import styles from './page.module.css';

function parseCcEmails(value: string) {
  return value
    .split(/[,\n]/)
    .map((email) => email.trim())
    .filter(Boolean);
}

export default function CustomerBillingDetailsPage() {
  const { user } = useAuthenticator();
  const [customerRole, setCustomerRole] = useState<'account_owner' | 'read_only'>('read_only');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [billingEmail, setBillingEmail] = useState('');
  const [billingCcEmailsText, setBillingCcEmailsText] = useState('');
  const [attachAgentBreakdown, setAttachAgentBreakdown] = useState(true);
  const [sendPaymentReminder, setSendPaymentReminder] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [gstAbn, setGstAbn] = useState('');
  const [addressLine1, setAddressLine1] = useState('');

  const [savingEmail, setSavingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);

  const [savingAddress, setSavingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressSuccess, setAddressSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.userId) return;
    let cancelled = false;

    void getCustomerPortalContext(user.userId)
      .then(async (context) => {
        if (cancelled) return;
        setCustomerRole(context.role);
        setCustomerId(context.customerId);

        if (!context.customerId) {
          setLoadError('Could not resolve your customer account.');
          setLoading(false);
          return;
        }

        const result = await getCustomer(context.customerId);
        if (cancelled) return;

        if (result.errors && result.errors.length > 0) {
          const firstError = result.errors[0] as { message?: string } | undefined;
          setLoadError(firstError?.message ?? 'Could not load billing details.');
          setLoading(false);
          return;
        }

        const nextCustomer = result.data as Customer | null;
        setCustomer(nextCustomer);
        setBillingEmail(nextCustomer?.email ?? '');
        setBillingCcEmailsText((nextCustomer?.billingCcEmails ?? []).join(', '));
        setAttachAgentBreakdown(nextCustomer?.attachAgentBreakdown ?? true);
        setSendPaymentReminder(nextCustomer?.sendPaymentReminder ?? false);
        setCompanyName(nextCustomer?.companyName ?? '');
        setGstAbn(nextCustomer?.gstAbn ?? '');
        setAddressLine1(nextCustomer?.addressLine1 ?? '');
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load billing details.');
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user?.userId]);

  const handleSaveEmail = async () => {
    if (!customerId) return;
    setSavingEmail(true);
    setEmailError(null);
    setEmailSuccess(null);

    const result = await updateCustomer(customerId, {
      email: billingEmail.trim(),
      billingCcEmails: parseCcEmails(billingCcEmailsText),
      attachAgentBreakdown,
      sendPaymentReminder,
    });

    if (result.errors && result.errors.length > 0) {
      const firstError = result.errors[0] as { message?: string } | undefined;
      setEmailError(firstError?.message ?? 'Could not save billing email.');
      setSavingEmail(false);
      return;
    }

    setEmailSuccess('Billing email saved.');
    setSavingEmail(false);
  };

  const handleSaveAddress = async () => {
    if (!customerId) return;
    setSavingAddress(true);
    setAddressError(null);
    setAddressSuccess(null);

    const result = await updateCustomer(customerId, {
      companyName: companyName.trim(),
      gstAbn: gstAbn.trim(),
      addressLine1: addressLine1.trim(),
    });

    if (result.errors && result.errors.length > 0) {
      const firstError = result.errors[0] as { message?: string } | undefined;
      setAddressError(firstError?.message ?? 'Could not save billing address.');
      setSavingAddress(false);
      return;
    }

    setAddressSuccess('Billing address saved.');
    setSavingAddress(false);
  };

  const isAccountOwner = customerRole === 'account_owner';

  return (
    <div className={styles.container}>
      <PageHeader title="Billing Details" subtitle="Where invoices go and who pays them" />

      {loadError && <p className="nd-badge nd-badge--danger">{loadError}</p>}

      {!loading && !isAccountOwner && (
        <p className="nd-badge nd-badge--info">Only your account owner can edit billing details.</p>
      )}

      {!loading && isAccountOwner && (
        <div className={styles.layout}>
          <Card title="Where invoices go" subtitle="We email a PDF the morning after each period closes">
            <div className={styles.form}>
              {emailError && <p className="nd-badge nd-badge--danger">{emailError}</p>}
              {emailSuccess && <p className="nd-badge nd-badge--success">{emailSuccess}</p>}

              <Field label="Billing email" htmlFor="billing-email" required>
                <Input
                  id="billing-email"
                  type="email"
                  value={billingEmail}
                  onChange={(e) => setBillingEmail(e.target.value)}
                  disabled={savingEmail}
                />
              </Field>
              <Field label="Copy to" htmlFor="billing-cc" hint="Comma separated">
                <Input
                  id="billing-cc"
                  value={billingCcEmailsText}
                  onChange={(e) => setBillingCcEmailsText(e.target.value)}
                  disabled={savingEmail}
                />
              </Field>
              <Switch
                checked={attachAgentBreakdown}
                onChange={(e) => setAttachAgentBreakdown(e.target.checked)}
                label="Attach the agent breakdown for on-charging"
                disabled={savingEmail}
              />
              <Switch
                checked={sendPaymentReminder}
                onChange={(e) => setSendPaymentReminder(e.target.checked)}
                label="Send a reminder three days before the due date"
                disabled={savingEmail}
              />
              <div className={styles.actions}>
                <Button type="button" loading={savingEmail} disabled={savingEmail} onClick={() => void handleSaveEmail()}>
                  {savingEmail ? 'Saving…' : 'Save billing email'}
                </Button>
              </div>
            </div>
          </Card>

          <div className={styles.sidebar}>
            <Card title="Billing address">
              <div className={styles.form}>
                {addressError && <p className="nd-badge nd-badge--danger">{addressError}</p>}
                {addressSuccess && <p className="nd-badge nd-badge--success">{addressSuccess}</p>}

                <Field label="Entity name" htmlFor="billing-entity-name">
                  <Input
                    id="billing-entity-name"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={savingAddress}
                  />
                </Field>
                <Field label="ABN" htmlFor="billing-abn">
                  <Input
                    id="billing-abn"
                    value={gstAbn}
                    onChange={(e) => setGstAbn(e.target.value)}
                    disabled={savingAddress}
                  />
                </Field>
                <Field label="Address" htmlFor="billing-address">
                  <AddressAutocompleteInput
                    id="billing-address"
                    value={addressLine1}
                    onChange={setAddressLine1}
                    onResolved={(resolved: ResolvedAddress | null) => {
                      if (resolved) setAddressLine1(resolved.formattedAddress);
                    }}
                    disabled={savingAddress}
                    placeholder="Address"
                    className="nd-input"
                  />
                </Field>
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={savingAddress}
                    disabled={savingAddress}
                    onClick={() => void handleSaveAddress()}
                  >
                    {savingAddress ? 'Saving…' : 'Save address'}
                  </Button>
                </div>
              </div>
            </Card>

            <Card title="How you pay" subtitle="Set up by Null Device — ask us to change it">
              <div className={styles.payRows}>
                <div className={styles.payRow}>
                  <span className={styles.payLabel}>Rate</span>
                  <span className={styles.payValue}>
                    {typeof customer?.billingRatePerHour === 'number' ? `$${customer.billingRatePerHour.toFixed(2)}/hr` : '—'}
                  </span>
                </div>
                <div className={styles.payRow}>
                  <span className={styles.payLabel}>GST registered</span>
                  <span className={styles.payValue}>{customer?.gstRegistered ? 'Yes' : 'No'}</span>
                </div>
                <div className={styles.payRow}>
                  <span className={styles.payLabel}>Direct debit</span>
                  <span className={styles.payValue}>
                    {customer?.directDebitAccountName ? `${customer.directDebitAccountName} ••••` : 'Not set up'}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
