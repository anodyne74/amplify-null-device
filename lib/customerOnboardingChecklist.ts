/**
 * Pure aggregation for the admin customers panel's "Onboarding checklist" card
 * (app/administrator/customers/components/CustomerEditPanel.tsx). Computed client-side
 * from records already fetched for a customer — no new model, no new writes.
 */

import type { FeatureFlagName } from './featureFlags';

export interface ChecklistCustomer {
  createdAt?: string | null;
  defaultAgentInitials?: string | null;
}

export interface ChecklistCustomerUser {
  createdAt?: string | null;
}

export interface ChecklistRoute {
  createdAt?: string | null;
}

export interface ChecklistInvoice {
  status?: string | null;
  invoiceDate?: string | null;
}

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
  /** Formatted "when" date, or null if not reached yet (or not tracked for this item). */
  when: string | null;
}

function earliest(dates: (string | null | undefined)[]): string | null {
  const valid = dates.filter((date): date is string => Boolean(date));
  if (valid.length === 0) return null;
  return valid.reduce((min, date) => (new Date(date) < new Date(min) ? date : min));
}

function formatWhen(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Up to five milestones ("First teammate invited" only while account-owner-invite
 * is on for the Customer), worst-case-honest: each "when" is only shown if we actually have a
 * date for it (e.g. "default agent assigned" has no tracked timestamp, so it's left blank
 * rather than guessing).
 */
export function buildOnboardingChecklist(
  customer: ChecklistCustomer,
  customerUsers: ChecklistCustomerUser[],
  routes: ChecklistRoute[],
  invoices: ChecklistInvoice[],
  /** The Feature Flags on for this Customer (lib/featureFlags.ts's resolveOnFlags). */
  onFlags: readonly FeatureFlagName[]
): ChecklistItem[] {
  const sentInvoices = invoices.filter((invoice) => invoice.status === 'sent' || invoice.status === 'paid');

  const items: ChecklistItem[] = [
    {
      id: 'account-created',
      label: 'Account created',
      done: true,
      when: formatWhen(customer.createdAt ?? null),
    },
    {
      id: 'default-agent',
      label: 'Default agent assigned',
      done: Boolean(customer.defaultAgentInitials?.trim()),
      when: null,
    },
    {
      id: 'teammate-invited',
      label: 'First teammate invited',
      done: customerUsers.length > 0,
      when: formatWhen(earliest(customerUsers.map((user) => user.createdAt))),
    },
    {
      id: 'first-route',
      label: 'First route built',
      done: routes.length > 0,
      when: formatWhen(earliest(routes.map((route) => route.createdAt))),
    },
    {
      id: 'first-invoice',
      label: 'First invoice sent',
      done: sentInvoices.length > 0,
      when: formatWhen(earliest(sentInvoices.map((invoice) => invoice.invoiceDate))),
    },
  ];

  // A Customer whose Account Owner can't invite teammates isn't asked to --
  // the item is dropped rather than left looking incomplete (#298). A
  // display-only exception to flags never limiting staff: admins can still
  // add Customer users themselves.
  return onFlags.includes('account-owner-invite') ? items : items.filter((item) => item.id !== 'teammate-invited');
}
