/**
 * @jest-environment node
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Both scripts read and write amplify_outputs.json in the working directory,
// so run them as the build does, in a scratch directory.
const SCRIPTS = path.join(__dirname, '..');
const CLEAN_ENV = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/COGNITO|IDENTITY_POOL|GRAPHQL|^AWS_|^AMPLIFY_|^CI$|^GITHUB_ACTIONS$/.test(key))
);

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'amplify-outputs-'));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

const outputsPath = () => path.join(dir, 'amplify_outputs.json');
const readOutputs = () => JSON.parse(fs.readFileSync(outputsPath(), 'utf8'));
const writeOutputs = (outputs: unknown) => fs.writeFileSync(outputsPath(), JSON.stringify(outputs));

function generate(env: Record<string, string> = {}) {
  execFileSync('node', [path.join(SCRIPTS, 'generate-amplify-outputs-from-backend.js')], { cwd: dir, env: { ...CLEAN_ENV, ...env }, stdio: 'pipe' });
  return readOutputs();
}

function validate() {
  return spawnSync('node', [path.join(SCRIPTS, 'validate-amplify-outputs.js')], { cwd: dir, env: CLEAN_ENV, encoding: 'utf8' });
}

const REAL_IDS = {
  AMPLIFY_COGNITO_USER_POOL_ID: 'ap-southeast-2_TestPool1',
  AMPLIFY_COGNITO_CLIENT_ID: 'testclientid123',
  AMPLIFY_IDENTITY_POOL_ID: 'ap-southeast-2:00000000-0000-0000-0000-000000000000',
  AMPLIFY_GRAPHQL_ENDPOINT: 'https://example.appsync-api.ap-southeast-2.amazonaws.com/graphql',
};

describe('generate:config', () => {
  it('writes a Gen 2 outputs version with placeholder values', () => {
    const outputs = generate();
    expect(outputs.version).toBe('1.4');
    expect(outputs.auth.user_pool_id).toContain('PLACEHOLDER');
  });

  it('writes a version that Amplify.configure accepts, so auth and data are configured', () => {
    generate(REAL_IDS);
    const configured = execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import fs from 'node:fs';
         import { Amplify } from 'aws-amplify';
         Amplify.configure(JSON.parse(fs.readFileSync(${JSON.stringify(outputsPath())}, 'utf8')));
         const config = Amplify.getConfig();
         console.log(JSON.stringify({ pool: config.Auth?.Cognito?.userPoolId ?? null, endpoint: config.API?.GraphQL?.endpoint ?? null }));`,
      ],
      { cwd: path.join(SCRIPTS, '..'), encoding: 'utf8' }
    );
    expect(JSON.parse(configured)).toEqual({ pool: REAL_IDS.AMPLIFY_COGNITO_USER_POOL_ID, endpoint: REAL_IDS.AMPLIFY_GRAPHQL_ENDPOINT });
  });

  it('keeps the version already in the outputs it regenerates from', () => {
    writeOutputs({ version: '1.3', auth: {}, data: {} });
    expect(generate().version).toBe('1.3');
  });

  it('adds the version to an existing file that lacks one, keeping its values', () => {
    writeOutputs({ auth: { user_pool_id: 'ap-southeast-2_Existing', user_pool_client_id: 'existingclient' }, data: {} });
    const outputs = generate();
    expect(outputs.version).toBe('1.4');
    expect(outputs.auth.user_pool_id).toBe('ap-southeast-2_Existing');
  });
});

describe('validate:amplify-outputs', () => {
  it('rejects a file with no version', () => {
    generate();
    const withoutVersion = readOutputs();
    delete withoutVersion.version;
    writeOutputs(withoutVersion);
    const result = validate();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('"version"');
  });

  it('rejects a version Amplify does not recognise', () => {
    writeOutputs({ ...generate(), version: '2' });
    expect(validate().status).toBe(1);
  });

  it('accepts a generated file', () => {
    generate();
    expect(validate().status).toBe(0);
  });
});
