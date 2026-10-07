/**
 * The name under Bill To on an invoice: the Customer's Trading Name
 * (`companyName`), else its name, else the given id. Blank counts as unset.
 */
export function billToName(
  customer: { companyName?: string | null; name?: string | null } | null | undefined,
  fallbackId: string
): string {
  return customer?.companyName?.trim() || customer?.name?.trim() || fallbackId;
}
