jest.mock('@aws-amplify/backend', () => ({ defineStorage: (props: unknown) => props }));

import { storage } from '@/amplify/storage/resource';
import { reportObjectKey } from '@/lib/propertyHistoryReport';

type Rule = { who: string; actions: string[] };

// Records each rule the storage access callback declares.
const to = (who: string) => ({ to: (actions: string[]): Rule => ({ who, actions }) });
const allow = {
  authenticated: to('authenticated'),
  guest: to('guest'),
  groups: (groups: string[]) => to(`groups:${groups.join(',')}`),
  entity: (entity: string) => to(`entity:${entity}`),
  resource: () => to('resource'),
};

const rules = (storage as unknown as { access: (builder: typeof allow) => Record<string, Rule[]> }).access(allow);

/** The rules on every storage path that covers `key`. */
function rulesCovering(key: string): Rule[] {
  return Object.entries(rules)
    .filter(([path]) => key.startsWith(path.replace(/\*$/, '')))
    .flatMap(([, pathRules]) => pathRules);
}

describe('storage access rules', () => {
  it('grant no signed-in user anything under reports/ -- reports are read only through the reports API', () => {
    for (const key of [reportObjectKey('c1', 'PHR-20260927-ABC123'), reportObjectKey(null, 'PHR-20260927-ABC123')]) {
      expect(rulesCovering(key)).toEqual([]);
    }
  });

  it('still cover invoices and schedules', () => {
    expect(rulesCovering('invoices/INV-0001.pdf')).not.toEqual([]);
    expect(rulesCovering('schedules/2026-09.pdf')).not.toEqual([]);
  });
});
