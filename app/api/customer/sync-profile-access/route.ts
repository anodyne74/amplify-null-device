import { NextRequest, NextResponse } from 'next/server';
import { authorizeIamRequest } from '@/lib/server/authorizeIamRequest';
import type { IamDataClient } from '@/lib/server/iamDataClient';

const PENDING_SUB_PREFIX = 'pending:';

async function syncViewerSubsForCustomer(client: IamDataClient, customerId: string, viewerSubs: string[]) {
  const { data: routes } = await client.models.Route.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });
  for (const route of routes || []) {
    if (!route?.id) continue;
    await client.models.Route.update({ id: route.id, viewerSubs });

    const { data: stops } = await client.models.Stop.list({
      filter: { routeId: { eq: route.id } },
      limit: 1000,
    });
    for (const stop of stops || []) {
      if (!stop?.id) continue;
      await client.models.Stop.update({ id: stop.id, viewerSubs });
    }
  }

  const { data: invoices } = await client.models.Invoice.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });
  for (const invoice of invoices || []) {
    if (!invoice?.id) continue;
    await client.models.Invoice.update({ id: invoice.id, viewerSubs });
  }

  const { data: lineItems } = await client.models.LineItem.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
  });
  for (const lineItem of lineItems || []) {
    if (!lineItem?.id) continue;
    await client.models.LineItem.update({ id: lineItem.id, viewerSubs });
  }

  const { data: paymentRecords } = await client.models.PaymentRecord.list({
    filter: { customerId: { eq: customerId } },
    limit: 1000,
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

    const { data: ownRows } = await client.models.CustomerUser.list({
      filter: { userSub: { eq: claims.sub } },
      limit: 100,
    });

    const customerId = (ownRows || []).find((row) => row?.customerId)?.customerId;
    if (!customerId) {
      return NextResponse.json({ error: 'No customer mapping found for this user' }, { status: 404 });
    }

    const { data: allRows } = await client.models.CustomerUser.list({
      filter: { customerId: { eq: customerId } },
      limit: 1000,
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
