import { listAll } from '@/lib/listAll';
import type { IamDataClient } from './iamDataClient';

/**
 * Who a Customer's invoices go to: its Account Owner's email, else the
 * Customer's own email. Shared by the invoice email and the Missing Signs
 * Report, which goes to the same person. Null only if there's neither.
 */
export async function invoiceRecipientEmail(
  client: IamDataClient,
  customer: { id: string; email?: string | null }
): Promise<string | null> {
  const { data } = await listAll(client, 'CustomerUser', { filter: { customerId: { eq: customer.id } } });
  const users = (data as Array<{ role?: string | null; email?: string | null }> | undefined) ?? [];
  const owner = users.find((row) => row.role === 'account_owner' && row.email);
  return owner?.email || customer.email || null;
}
