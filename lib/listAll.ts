/**
 * Fetches every record a `model.list` call matches, walking `nextToken` until
 * it's exhausted. A single `list` call is never enough on its own: `limit`
 * caps items *scanned* before the filter is applied, not items *matched*, so
 * a filtered list can come back short (or empty) on the first page while
 * matches sit on later ones.
 *
 * Pass the data client and a model name (`listAll(client, 'Stop', ...)`), so
 * the same function works with the browser data client, the IAM client in
 * API routes, and the Lambda's own client. Keep this module free of `@/` imports and Amplify
 * configuration -- amplify/functions/* import it by relative path.
 *
 * Page errors don't stop the walk: Amplify often returns rows alongside
 * field-level errors, so every page is fetched and every error collected.
 * Callers that need an exact answer (payout maths, access sync) must check
 * `errors.length`. Only a thrown error (network, auth) propagates.
 */

import type { generateClient } from 'aws-amplify/data';
import type { Schema } from '../amplify/data/resource';

const PAGE_SIZE = 1000;

type DataClient = ReturnType<typeof generateClient<Schema>>;
type ModelName = keyof DataClient['models'] & keyof Schema;
type ModelListOptions = {
  [K in ModelName]: Parameters<Extract<DataClient['models'][K], { list: unknown }>['list']>[0];
};
type ListOptions<K extends ModelName> = Omit<NonNullable<ModelListOptions[K]>, 'limit' | 'nextToken'>;
// Item type comes from Schema rather than the list call's return type, which
// TypeScript can't instantiate through Amplify's generic list signature.
type ListItem<K extends ModelName> = Schema[K]['type'];

type ListResult = {
  data: unknown[];
  errors?: readonly unknown[] | null;
  nextToken?: string | null;
};

export async function listAll<K extends ModelName>(
  // Typed loosely so the browser, IAM and Lambda clients all fit without
  // TypeScript comparing their (identical, but very deep) model types.
  client: { models: object },
  model: K,
  options?: ListOptions<K>
): Promise<{ data: ListItem<K>[]; errors: unknown[] }> {
  const models = client.models as Record<string, { list: (options: object) => Promise<ListResult> }>;
  const list = (options: object) => models[model].list(options);
  const data: ListItem<K>[] = [];
  const errors: unknown[] = [];
  let nextToken: string | undefined;

  do {
    const page = await list({ ...options, limit: PAGE_SIZE, nextToken });

    if (page.errors && page.errors.length > 0) {
      errors.push(...page.errors);
    }
    if (page.data) {
      data.push(...(page.data.filter((item) => item != null) as ListItem<K>[]));
    }

    nextToken = page.nextToken ?? undefined;
  } while (nextToken);

  return { data, errors };
}
