/**
 * Prints the AppSync authorization Amplify generates from amplify/data/resource.ts,
 * per model and operation, without deploying.
 *
 *   npm run synth:auth -- Customer Route   # just these models
 *   npm run synth:auth                     # every model
 *   npm run synth:auth -- Customer --keep  # also keep the synth output (raw VTL) and print its path
 *
 * Synthesizes the data construct into a temp dir, then reads each operation's auth
 * resolver: which groups and owner fields are admitted, and for create/update which
 * fields each may set and which it may set to null. Sending null for a field outside
 * the null list fails with "Unauthorized on [field]"; granting delete on the field fixes it.
 * A scalar field with its own read resolver is listed when a field-level rule changes who reads it.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { App, Stack } from 'aws-cdk-lib';
import { UserPool } from 'aws-cdk-lib/aws-cognito';
import { AmplifyData, AmplifyDataDefinition } from '@aws-amplify/data-construct';
import { schema } from '../amplify/data/resource';

type Grant = { role: string; all: boolean; set: string[]; nullable: string[] | null };

const args = process.argv.slice(2);
const keep = args.includes('--keep');
const models = args.filter((a) => !a.startsWith('--'));

// The transformer's owner-reassignment warning is noise here.
const { log, warn } = console;
console.log = console.warn = () => {};
const sdl = schema.transform().schema;
const out = mkdtempSync(join(tmpdir(), 'synth-auth-'));
const app = new App({ outdir: out });
const stack = new Stack(app, 'S', { env: { region: 'ap-southeast-2', account: '111111111111' } });
new AmplifyData(stack, 'D', {
  definition: AmplifyDataDefinition.fromString(sdl),
  authorizationModes: {
    defaultAuthorizationMode: 'AMAZON_COGNITO_USER_POOLS',
    userPoolConfig: { userPool: new UserPool(stack, 'P') },
    iamConfig: { enableIamAuthorizationMode: true },
  },
});
app.synth();
Object.assign(console, { log, warn });

/** Each auth function's templates, keyed by function name (e.g. MutationupdateCustomerauth0Function). */
const authTemplates = new Map<string, string>();
for (const file of readdirSync(out).filter((f) => f.endsWith('.nested.template.json'))) {
  const resources = JSON.parse(readFileSync(join(out, file), 'utf8')).Resources;
  for (const { Type, Properties: p } of Object.values<{ Type: string; Properties: Record<string, unknown> }>(
    resources,
  )) {
    if (Type !== 'AWS::AppSync::FunctionConfiguration' || !/auth\d+Function$/.test(String(p.Name))) continue;
    const vtl = ['RequestMappingTemplateS3Location', 'ResponseMappingTemplateS3Location']
      .map((k) => p[k])
      .filter((loc): loc is string => typeof loc === 'string')
      .map((loc) => readFileSync(join(out, `asset.${loc.split('/').pop()}`), 'utf8'))
      .join('\n');
    authTemplates.set(String(p.Name), vtl);
  }
}

function grants(vtl: string): Grant[] {
  const result: Grant[] = [];
  const groups = vtl.match(/\$staticGroupRoles = (\[.*?\]) \)/);
  for (const g of groups ? JSON.parse(groups[1]) : []) {
    result.push({
      role: g.entity,
      all: g.allowedFields === undefined || g.isAuthorizedOnAllFields === true,
      set: g.allowedFields ?? [],
      nullable: g.nullAllowedFields ?? null,
    });
  }
  for (const [, n, field] of vtl.matchAll(/\$ownerEntity(\d+) = \$util\.defaultIfNull\(\$ctx\.[\w.]*?\.(\w+),/g)) {
    const list = (name: string) => {
      const m = vtl.match(new RegExp(`\\$${name}${n} = (\\[.*?\\]) \\)`));
      return m ? (JSON.parse(m[1]) as string[]) : null;
    };
    const set = list('ownerAllowedFields');
    result.push({
      role: `owner ${field}`,
      all: set === null || new RegExp(`\\$isAuthorizedOnAllFields${n} = true`).test(vtl),
      set: set ?? [],
      nullable: list('ownerNullAllowedFields'),
    });
  }
  for (const [, field] of vtl.matchAll(/authFilter\.add\(\{"(\w+)"/g)) {
    result.push({ role: `owner ${field}`, all: true, set: [], nullable: null });
  }
  return result.filter((g, i) => result.findIndex((h) => h.role === g.role) === i);
}

/** "all", or whichever is shorter: the fields left out, or the fields included. */
function fieldList(fields: string[], every: string[]): string {
  const missing = every.filter((f) => !fields.includes(f));
  if (missing.length === 0) return 'all';
  return missing.length < fields.length ? `all but ${missing.join(', ')}` : fields.join(', ') || 'none';
}

function describe(g: Grant, every: string[], withFields: boolean): string {
  if (!withFields) return g.role;
  const set = g.all ? 'all' : fieldList(g.set, every);
  const nullable = g.nullable === null ? set : fieldList(g.nullable, every);
  return set === 'all' && nullable === 'all' ? `${g.role}: all` : `${g.role}: set ${set} | null ${nullable}`;
}

const allModels = [...authTemplates.keys()]
  .map((name) => name.match(/^Mutationcreate(\w+)auth0Function$/)?.[1])
  .filter((m): m is string => !!m)
  .sort();
const unknown = models.filter((m) => !allModels.includes(m));
if (unknown.length) {
  console.error(`Unknown model(s): ${unknown.join(', ')}. Models: ${allModels.join(', ')}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}

for (const model of models.length ? models : allModels) {
  const ops: [string, string | undefined, boolean][] = [
    ['create', authTemplates.get(`Mutationcreate${model}auth0Function`), true],
    ['update', authTemplates.get(`Mutationupdate${model}auth0Function`), true],
    ['delete', authTemplates.get(`Mutationdelete${model}auth0Function`), false],
    ['read', authTemplates.get(`Queryget${model}auth0Function`), false],
  ];
  const start = sdl.search(new RegExp(`^type ${model} @model`, 'm'));
  const body = sdl.slice(start, sdl.indexOf('\n}', start));
  const relations = [...body.matchAll(/^\s*(\w+):.*@(hasMany|hasOne|belongsTo)/gm)].map((m) => m[1]);
  const every = [
    ...new Set(ops.flatMap(([, vtl]) => (vtl ? grants(vtl) : [])).flatMap((g) => [...g.set, ...(g.nullable ?? [])])),
  ].filter((f) => f !== 'id' && !relations.includes(f));
  console.log(model);
  for (const [op, vtl, withFields] of ops) {
    const lines = vtl ? grants(vtl).map((g) => describe(g, every, withFields)) : ['(no resolver)'];
    console.log(`  ${op.padEnd(7)}${lines.join(`\n  ${' '.repeat(7)}`)}`);
  }
  for (const [name, vtl] of authTemplates) {
    const field = name.match(new RegExp(`^${model}([a-z]\\w*)auth0Function$`))?.[1];
    if (field && every.includes(field)) {
      console.log(`  .${field.padEnd(6)}read ${grants(vtl).map((g) => g.role).join(', ')}`);
    }
  }
}

if (keep) console.log(`\nSynth output (raw VTL as asset.*.vtl): ${out}`);
else rmSync(out, { recursive: true, force: true });
