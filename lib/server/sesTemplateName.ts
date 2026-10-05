/**
 * The SES template to send with: an env-var override, else the name
 * amplify/backend.ts deployed (read from amplify_outputs.json, see
 * lib/amplifyOutputsCustom.ts), else that name rebuilt from the branch env
 * vars. Those aren't set in the SSR runtime, so the last is a last resort.
 */
export function sesTemplateName(baseName: string, { override, deployed }: { override?: string; deployed?: string }): string {
  if (override) return override;
  if (deployed) return deployed;
  const branch = (process.env.AWS_BRANCH || process.env.AMPLIFY_BRANCH || '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return branch ? `${baseName}-${branch}` : baseName;
}
