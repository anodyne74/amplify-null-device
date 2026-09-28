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

  it('give only administrators and operators invoices and schedules -- customers open invoice PDFs through the invoice PDF API (#356)', () => {
    for (const key of ['invoices/inv-1.pdf', 'schedules/c1/1758931200000-march.pdf']) {
      expect(rulesCovering(key)).toEqual([{ who: 'groups:administrator,operator', actions: ['read', 'write', 'delete'] }]);
    }
  });

  it('let only administrators add files under requests/, never read them -- they are read only through the Route Request file API (#358, #359)', () => {
    expect(rulesCovering('requests/ses-msg-1/0-schedule.pdf')).toEqual([{ who: 'groups:administrator', actions: ['write'] }]);
  });
});
