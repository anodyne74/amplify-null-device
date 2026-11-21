/**
 * List every Operator's stored Text Consent answer (administrators only: the
 * model is read-only to clients, and an Operator may read just their own).
 * The stored answer is not the current one -- run it through
 * effectiveTextConsent() with the Operator's mobile. Returns them or throws a
 * DataError (lib/graphqlResult.ts).
 */
import { getDataClient } from '@/lib/data-client';
import { resultData, withDataError } from '@/lib/graphqlResult';
import { listAll } from '@/lib/listAll';

export async function listOperatorTextConsents() {
  return withDataError('Failed to load text consent.', async () =>
    resultData(await listAll(getDataClient(), 'OperatorTextConsent')) ?? []
  );
}
