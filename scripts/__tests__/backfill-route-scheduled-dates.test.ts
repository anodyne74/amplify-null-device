import {
  assertDevelopmentTarget,
  parseArgs,
  planScheduledDateBackfill,
} from '../backfill-route-scheduled-dates.js';

const DEV_URL = 'https://uczffjaqz5ep3cowq5l7f64ziy.appsync-api.ap-southeast-2.amazonaws.com/graphql';

describe('planScheduledDateBackfill', () => {
  it('fills an empty scheduledDate from the UTC date of actualStartTime', () => {
    expect(
      planScheduledDateBackfill([
        { id: 'r1', routeCode: 'W02-24-001', scheduledDate: null, actualStartTime: '2024-01-15T00:00:00Z' },
      ])
    ).toEqual([{ id: 'r1', routeCode: 'W02-24-001', current: null, next: '2024-01-15' }]);
  });

  it('falls back to placementStartTime', () => {
    expect(
      planScheduledDateBackfill([{ id: 'r1', routeCode: 'W03-26-001', placementStartTime: '2026-01-29T23:30:00Z' }])
    ).toEqual([{ id: 'r1', routeCode: 'W03-26-001', current: null, next: '2026-01-29' }]);
  });

  it('never touches a route that already has a scheduledDate', () => {
    expect(
      planScheduledDateBackfill([
        { id: 'r1', routeCode: 'W39-26-001', scheduledDate: '2026-09-22', actualStartTime: '2024-01-15T00:00:00Z' },
      ])
    ).toEqual([]);
  });

  it('skips routes with no start time to take a date from, never using createdAt', () => {
    expect(
      planScheduledDateBackfill([{ id: 'r1', routeCode: 'X', createdAt: '2026-09-18T04:00:00Z' }])
    ).toEqual([]);
  });
});

describe('assertDevelopmentTarget', () => {
  it('accepts the development API', () => {
    expect(() => assertDevelopmentTarget({ data: { url: DEV_URL } }, false)).not.toThrow();
  });

  it('refuses any other API without the override flag', () => {
    const other = { data: { url: 'https://abcdefghijklmnopqrstuvwxyz.appsync-api.ap-southeast-2.amazonaws.com/graphql' } };
    expect(() => assertDevelopmentTarget(other, false)).toThrow(/development/);
    expect(() => assertDevelopmentTarget({}, false)).toThrow(/development/);
    expect(() => assertDevelopmentTarget(other, true)).not.toThrow();
  });
});

describe('parseArgs', () => {
  it('defaults to a dry run against amplify_outputs.json', () => {
    expect(parseArgs(['node', 'script'])).toMatchObject({
      mode: 'dry-run',
      confirmApply: false,
      outputsPath: 'amplify_outputs.json',
      allowNonDevelopment: false,
    });
  });

  it('reads the mode, confirmation, outputs path and override flag', () => {
    expect(
      parseArgs([
        'node', 'script',
        '--mode', 'apply', '--confirm-apply', '--outputs-path', 'dev.json', '--allow-non-development',
      ])
    ).toMatchObject({ mode: 'apply', confirmApply: true, outputsPath: 'dev.json', allowNonDevelopment: true });
  });
});
