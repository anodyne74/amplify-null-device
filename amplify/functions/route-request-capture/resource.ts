import { defineFunction } from '@aws-amplify/backend';

/**
 * Captures each email sent to requests@ as a Route Request record (#358,
 * lib/routeRequestCapture.ts). SES invokes it from the inbound receipt rule,
 * beside the forwarder; amplify/backend.ts wires that up, grants it read on
 * the inbound bucket and put on the app bucket's requests/ path, and passes
 * both bucket names. It lives with the data stack, whose API it calls.
 */
export const routeRequestCapture = defineFunction({
  name: 'route-request-capture',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 512,
  resourceGroupName: 'data',
});
