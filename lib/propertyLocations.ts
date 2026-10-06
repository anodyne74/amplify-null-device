/**
 * The Property aggregate's location decisions (#286) as the browser reads and
 * writes them: the Location review queue, confirming a Property's pin (applied
 * to every Stop at it, across Customers), dismissing a suburb mismatch, and the
 * Confirmed-pin lookup new and edited Stops use instead of their geocode.
 */

import { fetchUserId } from '@/lib/amplify-config';
import { recordAudit } from '@/lib/auditLog';
import { getDataClient } from '@/lib/data-client';
import { listAll } from '@/lib/listAll';
import { activeStops } from '@/lib/loadChange';
import { buildLocationReviewQueue, type Pin, type PropertyReview } from '@/lib/locationReview';

const REVIEW_STOP_FIELDS = [
  'id',
  'routeId',
  'customerId',
  'address',
  'latitude',
  'longitude',
  'locationPrecision',
  'addressSuburb',
  'propertyKey',
  'placedLatitude',
  'placedLongitude',
  'placedAccuracyMeters',
  'placedPositionAt',
  'removed',
] as const;

type Result = { ok: true } | { ok: false; error: string };

function describeErrors(errors: readonly unknown[]): string {
  return errors.map((error) => (error as { message?: string })?.message ?? String(error)).join('; ');
}

/** A Confirmed Property's pin, or null. Throws if the lookup fails. */
export async function getConfirmedPin(propertyKey: string): Promise<Pin | null> {
  const { data, errors } = await getDataClient().models.PropertyLocation.get({ propertyKey });
  if (errors?.length) throw new Error(`Could not look up the Property's location: ${describeErrors(errors)}`);
  if (!data?.confirmedAt || typeof data.latitude !== 'number' || typeof data.longitude !== 'number') return null;
  return { latitude: data.latitude, longitude: data.longitude };
}

/** Every Property awaiting review. Stops are scanned in full, so a failed page is an error, not a shorter queue. */
export async function listLocationReviewQueue(): Promise<{ data: PropertyReview[]; error?: string }> {
  try {
    const client = getDataClient();
    const [stops, decisions] = await Promise.all([
      listAll(client, 'Stop', { selectionSet: REVIEW_STOP_FIELDS }),
      listAll(client, 'PropertyLocation'),
    ]);
    const errors = [...stops.errors, ...decisions.errors];
    if (errors.length > 0) {
      console.error('Errors loading the location review queue:', errors);
      return { data: [], error: 'Could not load every Stop, so the queue may be incomplete.' };
    }
    // A Stop a Load Change removed is never visited, so needs no pin.
    return { data: buildLocationReviewQueue(activeStops(stops.data), decisions.data) };
  } catch (error) {
    console.error('Error loading the location review queue:', error);
    return { data: [], error: 'Could not load the location review queue.' };
  }
}

async function listStopIdsAtProperty(propertyKey: string): Promise<string[]> {
  const ids: string[] = [];
  let nextToken: string | null | undefined;
  do {
    const page = await getDataClient().models.Stop.listStopsByPropertyKey(
      { propertyKey },
      { selectionSet: ['id'], limit: 1000, nextToken }
    );
    if (page.errors?.length) throw new Error(`Could not list the Property's Stops: ${describeErrors(page.errors)}`);
    ids.push(...page.data.map((stop) => stop.id));
    nextToken = page.nextToken;
  } while (nextToken);
  return ids;
}

async function savePropertyLocation(propertyKey: string, fields: Record<string, string | number>): Promise<void> {
  const models = getDataClient().models.PropertyLocation;
  const { data: existing, errors: readErrors } = await models.get({ propertyKey });
  if (readErrors?.length) throw new Error(describeErrors(readErrors));
  const { errors } = existing
    ? await models.update({ propertyKey, ...fields })
    : await models.create({ propertyKey, ...fields });
  if (errors?.length) throw new Error(describeErrors(errors));
}

/**
 * Confirms a Property's pin: every Stop at it moves there and becomes Confirmed
 * (never overwritten by a re-geocode or backfill), then the Property records the
 * pin, which takes it out of the queue and gives new Stops at the address this
 * pin. If any Stop can't be moved the Property isn't marked Confirmed, so it
 * stays in the queue to retry. Writes one AuditLog entry either way.
 */
export async function confirmPropertyLocation(
  propertyKey: string,
  pin: Pin,
  source: 'suggestion' | 'manual'
): Promise<Result> {
  const client = getDataClient();
  const adminSub = await fetchUserId();
  let stopIds: string[] = [];
  let failure: string | undefined;

  try {
    stopIds = await listStopIdsAtProperty(propertyKey);
    const updates = await Promise.all(
      stopIds.map((id) =>
        client.models.Stop.update({ id, latitude: pin.latitude, longitude: pin.longitude, locationPrecision: 'confirmed' })
          .then(({ errors }) => !errors?.length)
          .catch(() => false)
      )
    );
    const failed = updates.filter((ok) => !ok).length;
    if (failed > 0) {
      failure = `${failed} of ${stopIds.length} Stops could not be moved; try again.`;
    } else {
      await savePropertyLocation(propertyKey, {
        latitude: pin.latitude,
        longitude: pin.longitude,
        confirmedAt: new Date().toISOString(),
        ...(adminSub ? { confirmedBy: adminSub } : {}),
      });
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  const audit = await recordAudit(client, {
    actor: adminSub,
    eventType: 'data_modification',
    resource: { type: 'property', id: propertyKey },
    action: 'property.confirm_location',
    failure,
    details: { propertyKey, ...pin, source, stopIds },
  });

  if (failure) return { ok: false, error: failure };
  if (!audit.ok) {
    console.error('Writing the location confirmation audit entry failed:', audit.errors);
    return { ok: false, error: 'The location was confirmed, but its audit entry could not be written.' };
  }
  return { ok: true };
}

/** Dismisses a Property's suburb mismatch flag; it stays dismissed however often the address is re-geocoded. */
export async function dismissSuburbMismatch(propertyKey: string): Promise<Result> {
  try {
    const adminSub = await fetchUserId();
    await savePropertyLocation(propertyKey, {
      suburbMismatchDismissedAt: new Date().toISOString(),
      ...(adminSub ? { suburbMismatchDismissedBy: adminSub } : {}),
    });
    return { ok: true };
  } catch (error) {
    console.error('Dismissing the suburb mismatch failed:', error);
    return { ok: false, error: 'Could not dismiss the suburb mismatch.' };
  }
}
