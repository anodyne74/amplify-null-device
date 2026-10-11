/**
 * @jest-environment node
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync('amplify/data/resource.ts', 'utf8');

/** A model's declaration in the schema source, from `Name: a` to the next top-level model. */
function modelBlock(name: string): string {
  const start = source.search(new RegExp(`^  ${name}: a$`, 'm'));
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = source.slice(start + 1);
  const next = rest.search(/^  [A-Za-z]+: a(\.|$)|^\}\)/m);
  return rest.slice(0, next === -1 ? undefined : next);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (entry === '__tests__' || entry === 'node_modules') return [];
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
  });
}

describe('Route Estimate stays staff-only (ADR 0011)', () => {
  it('is readable by administrators and operators and nobody else', () => {
    const auth = modelBlock('RouteEstimate').split('.authorization(')[1];
    expect(auth).toContain("allow.groups(['administrator', 'operator']).to(['read'])");
    expect(auth.match(/allow\./g)).toHaveLength(1);
  });

  it('is not a field of Route, which customers can read', () => {
    expect(modelBlock('Route')).not.toMatch(/routeEstimate|totalMeters|originLatitude|stopPins/i);
  });

  it('is not referenced by any customer-facing code', () => {
    const customerFiles = [
      ...sourceFiles('app/customer'),
      ...sourceFiles('app/api/customer'),
      ...readdirSync('lib')
        .filter((file) => /^customer.*\.tsx?$/.test(file) && !/\.test\./.test(file))
        .map((file) => join('lib', file)),
    ];
    expect(customerFiles.length).toBeGreaterThan(0);
    const offenders = customerFiles.filter((file) => /RouteEstimate|route-estimate|routeEstimate/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
