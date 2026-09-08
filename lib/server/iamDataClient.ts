import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/data';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import type { Schema } from '@/amplify/data/resource';
import outputs from '@/amplify_outputs.json';

/**
 * Shared IAM-authenticated data client for the handful of Next.js API routes
 * that need to bypass per-record owner authorization from inside an SSR
 * request handler (self-healing profile sync, admin invite-user, and parts
 * of the invoice/job-assigned email senders) -- see each route's own comment
 * for why it needs elevated access. AppSync grants unconditional access to
 * any IAM caller for these models (amplify/backend.ts grants this Lambda's
 * own execution role, AmplifyHostingSSRCompute, appsync:GraphQL on this API).
 *
 * Getting a valid AWS signature is the part that's easy to get wrong here:
 * `Amplify.configure(outputs)` with no second argument defaults to a Cognito
 * Identity-Pool-based credentials provider (see aws-amplify's
 * initSingleton.mjs), which has nothing to resolve in a stateless SSR
 * process -- there's no signed-in Identity Pool session. That silently
 * produces an unauthenticated request, which AppSync rejects with a 401
 * before it ever reaches field-level (@aws_iam) authorization -- a request
 * routes previously misread as "no data" because they only checked `data`,
 * never `errors` or the HTTP status.
 *
 * `defaultProvider()` resolves this Lambda's own execution-role credentials
 * from the standard AWS SDK v3 credential chain -- the same mechanism
 * `@aws-sdk/client-ses` and `@aws-sdk/client-cognito-identity-provider`
 * already use internally elsewhere in this codebase, and functionally
 * equivalent to what `getAmplifyDataClientConfig()` wires up automatically
 * for the amplify/functions/* Lambdas.
 */
const getCredentials = defaultProvider();

let _client: ReturnType<typeof generateClient<Schema>> | null = null;

export function getIamDataClient() {
  if (!_client) {
    Amplify.configure(outputs, {
      Auth: {
        credentialsProvider: {
          getCredentialsAndIdentityId: async () => ({
            credentials: await getCredentials(),
          }),
          clearCredentialsAndIdentityId: () => {
            // No cached Identity Pool session to clear -- credentials come
            // straight from the execution role on every call.
          },
        },
      },
    });
    _client = generateClient<Schema>({ authMode: 'iam' });
  }
  return _client;
}
