/**
 * A data read or write that failed, with a message fit to show the user. The
 * raw GraphQL errors (or the thrown network/auth error) are in `cause`, and
 * were logged where the failure happened, so callers only show `message`.
 */
export class DataError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DataError';
    this.cause = cause;
  }
}

/** The errors an AppSync result came back with, on its way to becoming a DataError. */
class ResultErrors extends Error {
  constructor(readonly errors: readonly unknown[]) {
    super('The data client returned errors.');
  }
}

/**
 * An AppSync result's data, or a throw when it carries any errors -- including
 * a listAll that got some rows alongside its errors: partial data that looks
 * complete is worse than a clear failure. Use inside withDataError.
 */
export function resultData<T>(result: { data?: T | null; errors?: readonly unknown[] | null }): T | null {
  if (result.errors && result.errors.length > 0) throw new ResultErrors(result.errors);
  return result.data ?? null;
}

/**
 * Runs one aggregate operation, turning any failure into a DataError with
 * `message` (a DataError thrown inside passes through as it is). The raw
 * errors are logged here, once, and never shown: they can name fields.
 */
export async function withDataError<T>(message: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DataError) throw error;
    const cause = error instanceof ResultErrors ? error.errors : error;
    console.error(message, cause);
    throw new DataError(message, cause);
  }
}

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
