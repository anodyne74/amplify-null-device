import { planRouteFeedback, routeFeedbackEmail, routeFeedbackLocked } from './routeFeedback';

const AT = '2026-10-05T01:00:00.000Z';
const caller = { sub: 'sub-ann', name: 'Ann Agent', email: 'ann@agency.test' };

function route(overrides: Record<string, unknown> = {}) {
  return { id: 'route-1', customerId: 'cust-1', status: 'completed', viewerSubs: ['sub-ann', 'sub-ben'], ...overrides } as Parameters<
    typeof planRouteFeedback
  >[0]['route'];
}

describe('routeFeedbackLocked', () => {
  it('locks feedback until the Route is completed, and again once it is invoiced', () => {
    expect(routeFeedbackLocked(route({ status: 'signs_picked_up' }), false)).toBe('This route isn’t complete yet.');
    expect(routeFeedbackLocked(route(), false)).toBeNull();
    expect(routeFeedbackLocked(route(), true)).toBe('This route has been invoiced, so its feedback can no longer be changed.');
  });
});

describe('planRouteFeedback', () => {
  const base = { route: route(), caller, invoiced: false, at: AT };

  it('saves All good in one go, with no note needed', () => {
    expect(planRouteFeedback({ ...base, input: { tone: 'good' } })).toEqual({
      patch: {
        customerFeedbackTone: 'good',
        customerFeedbackNote: '',
        customerFeedbackAt: AT,
        customerFeedbackBy: 'sub-ann',
        customerFeedbackByName: 'Ann Agent',
      },
      changed: false,
    });
  });

  it('needs a note to say something was off, and keeps it trimmed', () => {
    expect(planRouteFeedback({ ...base, input: { tone: 'issue', note: '   ' } })).toEqual({
      refused: 'Say what was off.',
      status: 400,
    });
    const plan = planRouteFeedback({ ...base, input: { tone: 'issue', note: '  Two signs at 5 Kent St faced the wrong way. ' } });
    expect(plan).toMatchObject({ patch: { customerFeedbackTone: 'issue', customerFeedbackNote: 'Two signs at 5 Kent St faced the wrong way.' } });
  });

  it('names the sender by email when the user has no name', () => {
    const plan = planRouteFeedback({ ...base, caller: { ...caller, name: ' ' }, input: { tone: 'good' } });
    expect(plan).toMatchObject({ patch: { customerFeedbackByName: 'ann@agency.test' } });
  });

  it('marks a change when the Route already had feedback', () => {
    const plan = planRouteFeedback({ ...base, route: route({ customerFeedbackTone: 'good' }), input: { tone: 'issue', note: 'Missing sign' } });
    expect(plan).toMatchObject({ changed: true });
  });

  it('refuses anyone who is not a viewer of the Route', () => {
    expect(planRouteFeedback({ ...base, caller: { ...caller, sub: 'sub-stranger' }, input: { tone: 'good' } })).toEqual({
      refused: 'Route not found',
      status: 404,
    });
  });

  it('refuses a Route that is not completed, or is invoiced', () => {
    expect(planRouteFeedback({ ...base, route: route({ status: 'in_progress' }), input: { tone: 'good' } })).toEqual({
      refused: 'This route isn’t complete yet.',
      status: 409,
    });
    expect(planRouteFeedback({ ...base, invoiced: true, input: { tone: 'good' } })).toEqual({
      refused: 'This route has been invoiced, so its feedback can no longer be changed.',
      status: 409,
    });
  });

  it('refuses an unknown choice', () => {
    expect(planRouteFeedback({ ...base, input: { tone: 'great' as never } })).toEqual({ refused: 'Choose All good or Something was off.', status: 400 });
  });
});

describe('routeFeedbackEmail', () => {
  it('tells admin what was off, by whom, with a link to the Route', () => {
    const email = routeFeedbackEmail({
      routeId: 'route-1',
      routeCode: 'W40-26-003',
      customerName: 'Harcourts Epping',
      byName: 'Ann Agent',
      note: 'Two signs faced the wrong way.',
      changed: false,
      appBaseUrl: 'https://www.nulldevice.dev/',
    });

    expect(email.subject).toBe('Route W40-26-003: Harcourts Epping says something was off');
    expect(email.text).toContain('Ann Agent');
    expect(email.text).toContain('Two signs faced the wrong way.');
    expect(email.text).toContain('https://www.nulldevice.dev/administrator/routes/detail?id=route-1');
  });

  it('says when it replaces earlier feedback', () => {
    const email = routeFeedbackEmail({
      routeId: 'route-1',
      routeCode: 'W40-26-003',
      customerName: 'Harcourts Epping',
      byName: 'Ann Agent',
      note: 'Missing sign',
      changed: true,
      appBaseUrl: 'https://www.nulldevice.dev',
    });
    expect(email.text).toContain('This replaces earlier feedback on this route.');
  });
});
