import { geocodeAddress } from './googleMaps';
import { saveStop } from './routes';
import type { LocatedStop } from './stopLocation';

/**
 * Corrects the entered address of every Stop at a Property -- the Location
 * review queue's answer to a suburb mismatch the entered address got wrong
 * (#286). The address is geocoded once, and each Stop saved as any address
 * edit would be (saveStop: a new Property key; a Confirmed Stop keeps its pin).
 */
export async function correctPropertyAddress(
  stops: (LocatedStop & { id: string })[],
  address: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = address.trim();
  if (!trimmed) return { ok: false, error: 'Enter the corrected address.' };

  let geocoded;
  try {
    geocoded = await geocodeAddress(trimmed);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not locate the corrected address.' };
  }

  const results = await Promise.all(
    stops.map((stop) => saveStop({ original: stop }, { address: trimmed, resolvedLocation: geocoded }))
  );
  const failed = results.filter(({ errors }) => errors && errors.length > 0).length;
  return failed > 0 ? { ok: false, error: `${failed} of ${stops.length} Stops could not be updated; try again.` } : { ok: true };
}
