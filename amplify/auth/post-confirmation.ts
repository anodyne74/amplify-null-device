import type { PostConfirmationTriggerHandler } from 'aws-lambda';

/**
 * Post-confirmation trigger is intentionally a no-op.
 * New signups remain pending until an administrator assigns a role group.
 */
export const handler: PostConfirmationTriggerHandler = async (event) => {
  return event;
};
