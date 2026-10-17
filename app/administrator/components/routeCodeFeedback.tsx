import type { ReactNode } from 'react';
import { routeCodeClashes, type RouteCodeEntry } from '@/lib/routeCode';

const routeHref = (routeId: string) => `/administrator/routes/detail?id=${routeId}`;

/**
 * What to tell an administrator about the Route Code in a field (lib/routeCode.ts):
 * a warning, with a link to the Route, when another Route already has it; a note
 * when the Routes couldn't be read so there was nothing to check it against.
 * Never blocks saving -- resolving a clash is the administrator's call. `routes`
 * is undefined while loading and null if they couldn't be read.
 */
export function routeCodeFeedback(
  routes: readonly RouteCodeEntry[] | null | undefined,
  code: string,
  ownId?: string
): { error?: ReactNode; hint?: ReactNode } {
  if (routes === undefined) return {};
  if (routes === null) {
    return { hint: "Couldn't check existing Route Codes. Make sure this one isn't already used." };
  }

  const [first, ...others] = routeCodeClashes(routes, code, ownId);
  if (!first) return {};
  return {
    error: (
      <>
        This code is already used by{' '}
        <a href={routeHref(first.id)} target="_blank" rel="noreferrer">
          another Route
        </a>
        {others.length > 0 ? ` and ${others.length} more` : ''}. Change it if they should be told apart.
      </>
    ),
  };
}
