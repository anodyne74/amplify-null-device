/** Unwraps an AppSync/GraphQL result, throwing `fallbackMessage` (or the
 * first returned error's own message, when present) on failure. */
export function unwrapOrThrow<T>(
  result: { data?: T | null; errors?: unknown[] | null },
  fallbackMessage: string
): T | null {
  if (result.errors && result.errors.length > 0) {
    const firstError = result.errors[0] as { message?: string } | undefined;
    throw new Error(firstError?.message ?? fallbackMessage);
  }
  return result.data ?? null;
}
