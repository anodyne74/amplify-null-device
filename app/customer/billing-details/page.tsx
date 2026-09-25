'use client';

import { useEffect, useState } from 'react';
import type { Customer } from '@/amplify/types';
import { getCustomer, updateCustomer } from '@/lib/queries';
import { useCustomerPortalContext, type CustomerPortalContext } from '@/lib/useCustomerPortalContext';
import { unwrapOrThrow } from '@/lib/graphqlResult';
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

async function fetchBillingDetailsData(context: CustomerPortalContext): Promise<Customer | null> {
  const result = await getCustomer(context.customerId);
  return unwrapOrThrow(result, 'Could not load billing details.') as Customer | null;
}

export default function CustomerBillingDetailsPage() {
  const {
    role: customerRole,
    customerId,
    data: customer,
    loading,
    error: loadError,
  } = useCustomerPortalContext({ fetchData: fetchBillingDetailsData });

  const [billingEmail, setBillingEmail] = useState('');
  const [billingCcEmailsText, setBillingCcEmailsText] = useState('');
  const [attachAgentBreakdown, setAttachAgentBreakdown] = useState(true);
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
    if (!customer) return;
    setBillingEmail(customer.email ?? '');
    setBillingCcEmailsText((customer.billingCcEmails ?? []).join(', '));
    setAttachAgentBreakdown(customer.attachAgentBreakdown ?? true);
    setCompanyName(customer.companyName ?? '');
    setGstAbn(customer.gstAbn ?? '');
    setAddressLine1(customer.addressLine1 ?? '');
  }, [customer]);

  const handleSaveEmail = async () => {
    if (!customerId) return;
    setSavingEmail(true);
    setEmailError(null);
    setEmailSuccess(null);

    const result = await updateCustomer(customerId, {
      email: billingEmail.trim(),
      billingCcEmails: parseCcEmails(billingCcEmailsText),
      attachAgentBreakdown,
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
