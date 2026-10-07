/**
 * Where a Customer's invoices go (CONTEXT.md, Invoice Recipients): To its
 * Billing email (`Customer.email`), with its billing CC addresses copied.
 * Account Owners aren't added. Each address appears once, whatever its case,
 * and blank entries are ignored. `to` is null only when there's no Billing
 * email. Shared by the invoice email and the Missing Signs Report.
 */
export function invoiceRecipients(customer: {
  email?: string | null;
  billingCcEmails?: ReadonlyArray<string | null> | null;
}): { to: string | null; cc: string[] } {
  const to = customer.email?.trim() || null;
  const seen = new Set<string>(to ? [to.toLowerCase()] : []);
  const cc: string[] = [];
  for (const raw of customer.billingCcEmails ?? []) {
    const address = raw?.trim();
    if (!address || seen.has(address.toLowerCase())) continue;
    seen.add(address.toLowerCase());
    cc.push(address);
  }
  return { to, cc };
}
