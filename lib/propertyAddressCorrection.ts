import { geocodeAddress } from './googleMaps';
import type { GeocodedLocation } from './locationPrecision';
import { saveStop } from './routes';
import type { LocatedStop } from './stopLocation';

/**
 * Corrects the entered address of every Stop at a Property -- the Location
 * review queue's answer to a suburb mismatch the entered address got wrong
 * (#286). The address is geocoded once -- or taken from the autocomplete pick
 * it came from -- and each Stop saved as any address edit would be (saveStop:
 * a new Property key, and that Property's Confirmed pin if it has one).
 */
export async function correctPropertyAddress(
  stops: (LocatedStop & { id: string })[],
  address: string,
  picked?: GeocodedLocation | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = address.trim();
  if (!trimmed) return { ok: false, error: 'Enter the corrected address.' };

  let geocoded;
  try {
    geocoded = picked ?? (await geocodeAddress(trimmed));
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not locate the corrected address.' };
  }

  const results = await Promise.allSettled(
    stops.map((stop) => saveStop({ original: stop }, { address: trimmed, resolvedLocation: geocoded }))
  );
  const failed = results.filter(({ status }) => status === 'rejected').length;
  return failed > 0 ? { ok: false, error: `${failed} of ${stops.length} Stops could not be updated; try again.` } : { ok: true };
}

/**
 * Tries again to put a Property's unpinned Stops on the map -- the Location
 * review queue's first answer to a Stop with no pin (#344). Each entered
 * address is geocoded once, and each Stop saved with it as any edit would be
 * (saveStop: a Confirmed pin wins, and the Property key is rebuilt from the
 * geocoded address parts). Stops already on the map are left alone.
 */
export async function locateUnpinnedStops(
  stops: (LocatedStop & { id: string })[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const unpinned = stops.filter(
    (stop) => stop.address?.trim() && (typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number')
  );
  if (unpinned.length === 0) return { ok: true };

  const byAddress = new Map<string, typeof unpinned>();
  for (const stop of unpinned) {
    const address = (stop.address as string).trim();
    byAddress.set(address, [...(byAddress.get(address) ?? []), stop]);
  }

  let notFound = 0;
  let failed = 0;
  for (const [address, addressStops] of byAddress) {
    let geocoded;
    try {
      geocoded = await geocodeAddress(address);
    } catch {
      notFound += addressStops.length;
      continue;
    }
    const results = await Promise.allSettled(
      addressStops.map((stop) => saveStop({ original: stop }, { address, resolvedLocation: geocoded }))
    );
    failed += results.filter(({ status }) => status === 'rejected').length;
  }

  if (failed > 0) return { ok: false, error: `${failed} of ${unpinned.length} Stops could not be updated; try again.` };
  if (notFound > 0) {
    return {
      ok: false,
      error: `${notFound} of ${unpinned.length} Stops still couldn't be found on the map. Correct the address instead.`,
    };
  }
  return { ok: true };
}
