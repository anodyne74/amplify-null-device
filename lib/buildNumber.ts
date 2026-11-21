/**
 * The Build Number of the running deploy (CONTEXT.md, Build). Baked in by
 * next.config.js; `local` outside a deploy, `unknown` in a deploy that lost
 * its commit or job.
 */
export function buildNumber(): string {
  return process.env.NEXT_PUBLIC_BUILD_NUMBER || 'local';
}
