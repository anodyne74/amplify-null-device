/**
 * Where a Customer's invoices go (CONTEXT.md, Invoice Recipients): To its
 * Billing email (`Customer.email`), with its billing CC addresses copied.
 * Account Owners aren't added. Each address appears once, whatever its case.
 * CCs that are blank or don't look like an address are left out, so one typo
 * in Copy to (saved unchecked) can't make SES refuse the whole email. `to` is
 * null only when there's no Billing email. Shared by the invoice email and
 * the Missing Signs Report.
 */
export type InvoiceRecipients = { to: string | null; cc: string[] };

const LOOKS_LIKE_ADDRESS = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function invoiceRecipients(customer: {
  email?: string | null;
  billingCcEmails?: ReadonlyArray<string | null> | null;
}): InvoiceRecipients {
  const to = customer.email?.trim() || null;
  const seen = new Set<string>(to ? [to.toLowerCase()] : []);
  const cc: string[] = [];
  for (const raw of customer.billingCcEmails ?? []) {
    const address = raw?.trim();
    if (!address || !LOOKS_LIKE_ADDRESS.test(address) || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    cc.push(address);
  }
  return { to, cc };
}
