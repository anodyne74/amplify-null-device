import { generateClient } from 'aws-amplify/data';
import type { Schema } from '@/amplify/data/resource';
import { configureAmplify } from '@/lib/amplify-config';

let _client: ReturnType<typeof generateClient<Schema>> | null = null;

export function getDataClient() {
  configureAmplify();
  if (!_client) {
    _client = generateClient<Schema>();
  }
  return _client;
}
