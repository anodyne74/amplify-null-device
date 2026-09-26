import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import type { IamDataClient } from '@/lib/server/iamDataClient';
import { listAll } from '@/lib/listAll';

const PENDING_SUB_PREFIX = 'pending:';

async function syncViewerSubsForCustomer(client: IamDataClient, customerId: string, viewerSubs: string[]) {
  const { data: routes } = await listAll(client, 'Route', {
    filter: { customerId: { eq: customerId } },
  });
  for (const route of routes || []) {
    if (!route?.id) continue;
    await client.models.Route.update({ id: route.id, viewerSubs });

    const { data: stops } = await listAll(client, 'Stop', {
      filter: { routeId: { eq: route.id } },
    });
    for (const stop of stops || []) {
      if (!stop?.id) continue;
      await client.models.Stop.update({ id: stop.id, viewerSubs });
    }
  }

  const { data: invoices } = await listAll(client, 'Invoice', {
    filter: { customerId: { eq: customerId } },
  });
  for (const invoice of invoices || []) {
    if (!invoice?.id) continue;
    await client.models.Invoice.update({ id: invoice.id, viewerSubs });
  }

  const { data: lineItems } = await listAll(client, 'LineItem', {
    filter: { customerId: { eq: customerId } },
  });
  for (const lineItem of lineItems || []) {
    if (!lineItem?.id) continue;
    await client.models.LineItem.update({ id: lineItem.id, viewerSubs });
  }

  const { data: paymentRecords } = await listAll(client, 'PaymentRecord', {
    filter: { customerId: { eq: customerId } },
  });
  for (const paymentRecord of paymentRecords || []) {
    if (!paymentRecord?.id) continue;
    await client.models.PaymentRecord.update({ id: paymentRecord.id, viewerSubs });
  }
}

/**
 * Backfills viewerSubs/accountOwnerSub across Customer, Route, Stop, Invoice, LineItem
 * and PaymentRecord for the calling customer's account.
 *
 * These fields are normally synced by the customer-access-activation Lambda at signup
 * time, but that trigger only fires on new sign-ups — accounts that were already active
 * before the fields existed never get them set. This route lets any already-active
 * customer self-heal on next portal visit: it runs with the SSR compute role's elevated
 * data access (same pattern as the admin API routes), so it can read/write these records
 * before viewerSubs/accountOwnerSub are populated, which the caller's own session cannot.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await authorizeIamRequest(request, 'customer');
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { claims, client } = auth;

    const { data: ownRows } = await listAll(client, 'CustomerUser', {
      filter: { userSub: { eq: claims.sub } },
    });

    const customerId = (ownRows || []).find((row) => row?.customerId)?.customerId;
    if (!customerId) {
      return NextResponse.json({ error: 'No customer mapping found for this user' }, { status: 404 });
    }

    const { data: allRows } = await listAll(client, 'CustomerUser', {
      filter: { customerId: { eq: customerId } },
    });

    const viewerSubs = [
      ...new Set(
        (allRows || [])
          .map((row) => row.userSub?.trim())
          .filter((value): value is string => Boolean(value) && !value.startsWith(PENDING_SUB_PREFIX))
      ),
    ];

    const accountOwnerRow = (allRows || []).find(
      (row) => row.role === 'account_owner' && row.userSub && !row.userSub.startsWith(PENDING_SUB_PREFIX)
    );

    await client.models.Customer.update({
      id: customerId,
      viewerSubs,
      accountOwnerSub: accountOwnerRow?.userSub || undefined,
    });

    await syncViewerSubsForCustomer(client, customerId, viewerSubs);

    return NextResponse.json({ success: true, customerId });
  } catch (err) {
    console.error('Unexpected error in sync-profile-access:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
}
