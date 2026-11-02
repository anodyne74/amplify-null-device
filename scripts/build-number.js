import { execFileSync } from 'node:child_process';

/**
 * The Build Number (CONTEXT.md, Build): `YYYYMMDD-<short commit>-<job>`.
 * `next.config.js` bakes it into NEXT_PUBLIC_BUILD_NUMBER at build time, so the
 * browser bundle and the API routes read the same value.
 */
export function formatBuildNumber({ commitId, commitDate, jobId }) {
  if (!commitId || !commitDate || !jobId) return 'unknown';
  return `${commitDate}-${commitId.slice(0, 7)}-${jobId.replace(/^0+(?=\d)/, '')}`;
}

/** The commit's UTC date as YYYYMMDD, or undefined when git can't say. */
export function readCommitDate(commitId) {
  try {
    const out = execFileSync(
      'git',
      ['show', '-s', '--format=%cd', '--date=format-local:%Y%m%d', commitId],
      { env: { ...process.env, TZ: 'UTC' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return /^\d{8}$/.test(out) ? out : undefined;
  } catch {
    return undefined;
  }
}

const SHA = /^[0-9a-f]{7,40}$/i;

/**
 * The commit being built. Amplify's AWS_COMMIT_ID is the literal "HEAD" when a
 * job is started by hand without a commit id, so anything that isn't a SHA is
 * resolved from the checkout instead.
 */
export function resolveCommitId(env = process.env, readHead = readHeadCommit) {
  return SHA.test(env.AWS_COMMIT_ID ?? '') ? env.AWS_COMMIT_ID : readHead();
}

export function readHeadCommit() {
  try {
    const out = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return SHA.test(out) ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Amplify sets AWS_JOB_ID only inside a deploy: without it this is a developer's
 * copy ('local'); with it but missing pieces the number is 'unknown', and the
 * build carries on.
 */
export function resolveBuildNumber(env = process.env, readDate = readCommitDate, readHead = readHeadCommit) {
  if (!env.AWS_JOB_ID) return 'local';
  const commitId = resolveCommitId(env, readHead);
  return formatBuildNumber({
    commitId,
    commitDate: commitId ? readDate(commitId) : undefined,
    jobId: env.AWS_JOB_ID,
  });
}
