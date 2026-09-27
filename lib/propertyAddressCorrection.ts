import { geocodeAddress } from './googleMaps';
import { updateStop } from './routes';
import { locateEditedStop, type LocatedStop } from './stopLocation';

/**
 * Corrects the entered address of every Stop at a Property -- the Location
 * review queue's answer to a suburb mismatch the entered address got wrong
 * (#286). The address is geocoded once, and each Stop re-located as any address
 * edit would (a new Property key; a Confirmed Stop keeps its pin).
 */
export async function correctPropertyAddress(
  stops: (LocatedStop & { id: string })[],
  address: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = address.trim();
  if (!trimmed) return { ok: false, error: 'Enter the corrected address.' };

  let updates;
  try {
    const geocoded = await geocodeAddress(trimmed);
    updates = await Promise.all(
      stops.map(async (stop) => ({ id: stop.id, address: trimmed, ...(await locateEditedStop(stop, { address: trimmed, resolvedLocation: geocoded })) }))
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not locate the corrected address.' };
  }

  const results = await Promise.all(updates.map((update) => updateStop(update)));
  const failed = results.filter(({ errors }) => errors && errors.length > 0).length;
  return failed > 0 ? { ok: false, error: `${failed} of ${stops.length} Stops could not be updated; try again.` } : { ok: true };
}
