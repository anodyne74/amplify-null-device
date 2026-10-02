/**
 * An Operator's mobile number, read the way people write Australian mobiles
 * (`0412 345 678`, `0412345678`, `+61 412 345 678`, `61412345678`) and held in
 * one international form (`+61412345678`) for sending texts. Anything that
 * isn't an Australian mobile -- a landline, a short or long number, another
 * country's -- isn't one.
 */
export type AustralianMobile = { international: string; local: string };

export function australianMobile(raw: string | null | undefined): AustralianMobile | null {
  if (!raw) return null;
  const compact = raw.replace(/[\s().-]/g, '');
  const match = /^(?:\+?61|0)(4\d{8})$/.exec(compact);
  if (!match) return null;
  const national = match[1];
  return {
    international: `+61${national}`,
    local: `0${national.slice(0, 3)} ${national.slice(3, 6)} ${national.slice(6)}`,
  };
}

/** The number with all but its last three digits hidden, for the audit log. */
export function maskedMobile(mobile: AustralianMobile): string {
  return `${mobile.local.slice(0, 4)} *** ${mobile.local.slice(-3)}`;
}

export const MOBILE_FIELD_ERROR =
  'Mobile must be an Australian mobile number, like 0412 345 678 or +61 412 345 678.';

/**
 * What the Drivers screen's Mobile field saves: the international form, no
 * number when it's left empty, or a refusal for anything that isn't an
 * Australian mobile (#424).
 */
export function mobileToStore(raw: string): { ok: true; phone: string | null } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true, phone: null };
  const mobile = australianMobile(raw);
  return mobile ? { ok: true, phone: mobile.international } : { ok: false, error: MOBILE_FIELD_ERROR };
}

/** A stored number as people read it (`0412 345 678`); one that isn't a mobile is shown as stored, to be fixed. */
export function mobileForDisplay(stored: string | null | undefined): string {
  return australianMobile(stored)?.local ?? stored ?? '';
}
