import { buildOnboardingChecklist } from './customerOnboardingChecklist';

describe('buildOnboardingChecklist', () => {
  it('marks account created as always done, using the customer record date', () => {
    const items = buildOnboardingChecklist({ createdAt: '2026-01-05T00:00:00Z' }, [], [], []);
    const created = items.find((item) => item.id === 'account-created');
    expect(created).toMatchObject({ done: true, when: '5 Jan 2026' });
  });

  it('marks the remaining milestones undone with no data', () => {
    const items = buildOnboardingChecklist({}, [], [], []);
    expect(items.filter((item) => item.id !== 'account-created').every((item) => !item.done)).toBe(true);
  });

  it('leaves "default agent assigned" undated even when done — no timestamp is tracked for it', () => {
    const items = buildOnboardingChecklist({ defaultAgentName: 'Betty O\'Shea' }, [], [], []);
    const agent = items.find((item) => item.id === 'default-agent');
    expect(agent).toMatchObject({ done: true, when: null });
  });

  it('marks "first teammate invited" done using the earliest CustomerUser record', () => {
    const items = buildOnboardingChecklist(
      {},
      [{ createdAt: '2026-03-10T00:00:00Z' }, { createdAt: '2026-02-01T00:00:00Z' }],
      [],
      []
    );
    const invited = items.find((item) => item.id === 'teammate-invited');
    expect(invited).toMatchObject({ done: true, when: '1 Feb 2026' });
  });

  it('marks "first route built" done using the earliest route record', () => {
    const items = buildOnboardingChecklist({}, [], [{ createdAt: '2026-04-20T00:00:00Z' }], []);
    const route = items.find((item) => item.id === 'first-route');
    expect(route).toMatchObject({ done: true, when: '20 Apr 2026' });
  });

  it('only counts sent/paid invoices for "first invoice sent", ignoring drafts', () => {
    const items = buildOnboardingChecklist(
      {},
      [],
      [],
      [
        { status: 'draft', invoiceDate: '2026-01-01' },
        { status: 'sent', invoiceDate: '2026-05-15' },
      ]
    );
    const invoiced = items.find((item) => item.id === 'first-invoice');
    expect(invoiced).toMatchObject({ done: true, when: '15 May 2026' });
  });

  it('leaves "first invoice sent" undone when only drafts exist', () => {
    const items = buildOnboardingChecklist({}, [], [], [{ status: 'draft', invoiceDate: '2026-01-01' }]);
    const invoiced = items.find((item) => item.id === 'first-invoice');
    expect(invoiced).toMatchObject({ done: false, when: null });
  });
});
