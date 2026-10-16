/**
 * The Route Link's code (CONTEXT.md, ADR 0013): six lowercase characters
 * with nothing easily misread (no 0, o, 1, l or i), matched without regard to case.
 */
export const ROUTE_LINK_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const ROUTE_LINK_CODE_LENGTH = 6;

const ROUTE_LINK_CODE = new RegExp(`^[${ROUTE_LINK_ALPHABET}]{${ROUTE_LINK_CODE_LENGTH}}$`);

/** The code as stored, or null when the text isn't shaped like one (a Route id, say). */
export function routeLinkCode(text: string): string | null {
  const code = text.toLowerCase();
  return ROUTE_LINK_CODE.test(code) ? code : null;
}
