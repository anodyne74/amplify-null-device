import { randomInt } from 'node:crypto';
import type { IamDataClient } from '@/lib/server/iamDataClient';
import { ROUTE_LINK_ALPHABET, ROUTE_LINK_CODE_LENGTH } from '@/lib/routeLink';

const ATTEMPTS = 5;

// The typed client can't send a mutation condition, and the condition is what
// keeps two simultaneous notifications from replacing a code already texted.
const SET_CODE_IF_NONE = /* GraphQL */ `
  mutation SetRouteLinkCode($input: UpdateRouteInput!, $condition: ModelRouteConditionInput) {
    updateRoute(input: $input, condition: $condition) {
      id
    }
  }
`;

export function newRouteLinkCode(): string {
  return Array.from({ length: ROUTE_LINK_CODE_LENGTH }, () => ROUTE_LINK_ALPHABET[randomInt(ROUTE_LINK_ALPHABET.length)]).join('');
}

async function storedCode(client: IamDataClient, routeId: string): Promise<string | null> {
  const { data, errors } = await client.models.Route.get({ id: routeId }, { selectionSet: ['id', 'routeLinkCode'] });
  if (errors?.length) throw new Error('Could not read the Route to find its Route Link');
  return data?.routeLinkCode ?? null;
}

/**
 * A Route's Route Link code (CONTEXT.md, ADR 0013), made the first time it is
 * asked for and the same ever after. A code that clashes with another Route's
 * is made again; if another request stored a code first, theirs is used, so a
 * code that has already been texted is never replaced. Throws when no code
 * could be made or read.
 */
export async function ensureRouteLinkCode(client: IamDataClient, routeId: string): Promise<string> {
  const existing = await storedCode(client, routeId);
  if (existing) return existing;

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const code = newRouteLinkCode();
    const { data: holders, errors } = await client.models.Route.listRoutesByRouteLinkCode(
      { routeLinkCode: code },
      { selectionSet: ['id'], limit: 1 }
    );
    if (errors?.length) throw new Error('Could not check the Route Link for a clash');
    if (holders.length > 0) continue;

    try {
      const result = await client.graphql({
        query: SET_CODE_IF_NONE,
        variables: { input: { id: routeId, routeLinkCode: code }, condition: { routeLinkCode: { attributeExists: false } } },
      });
      if (!('errors' in result) || !result.errors?.length) return code;
    } catch {
      // Refused: most likely a code was stored in the meantime. Read it back to tell.
    }
    const winner = await storedCode(client, routeId);
    if (winner) return winner;
    throw new Error('Could not store the Route Link');
  }
  throw new Error('Could not make a Route Link that no other Route has');
}
