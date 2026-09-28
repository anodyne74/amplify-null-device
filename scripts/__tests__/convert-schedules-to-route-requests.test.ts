import {
  assertDevelopmentTarget,
  parseArgs,
  planScheduleConversion,
  scheduleFilename,
} from '../convert-schedules-to-route-requests.js';

const DEV_URL = 'https://uczffjaqz5ep3cowq5l7f64ziy.appsync-api.ap-southeast-2.amazonaws.com/graphql';

const ROUTE = {
  id: 'route-1',
  routeCode: 'W18-26-001',
  customerId: 'c1',
  createdAt: '2026-04-28T01:02:03.000Z',
  scheduleS3Key: 'schedules/c1/1714266000000-Tuesday: run.pdf',
};

describe('scheduleFilename', () => {
  it('drops the upload timestamp the New route upload put in front of the name', () => {
    expect(scheduleFilename('schedules/c1/1714266000000-Tuesday run.pdf')).toBe('Tuesday run.pdf');
  });

  it('keeps a name with no timestamp as it is', () => {
    expect(scheduleFilename('schedules/c1/schedule.csv')).toBe('schedule.csv');
  });
});

describe('planScheduleConversion', () => {
  it('turns a Route with a Schedule into a manual Route Request, uploaded by administrator, dated when the Route was created', () => {
    expect(planScheduleConversion([ROUTE], [], [])).toEqual({
      convert: [
        {
          recordId: 'schedule-route-1',
          routeId: 'route-1',
          routeCode: 'W18-26-001',
          customerId: 'c1',
          sentAt: '2026-04-28T01:02:03.000Z',
          sourceKey: 'schedules/c1/1714266000000-Tuesday: run.pdf',
          destinationKey: 'requests/schedule-route-1/0-Tuesday_ run.pdf',
          filename: 'Tuesday: run.pdf',
        },
      ],
      done: [],
      hasRouteRequest: [],
    });
  });

  it('skips Routes with no Schedule', () => {
    expect(planScheduleConversion([{ ...ROUTE, scheduleS3Key: null }], [], []).convert).toEqual([]);
  });

  it('counts a Route as done once its record exists and holds the Route Request slot, so a re-run changes nothing', () => {
    const plan = planScheduleConversion([ROUTE], [{ id: 'schedule-route-1' }], [{ id: 'route-1', recordId: 'schedule-route-1' }]);

    expect(plan.convert).toEqual([]);
    expect(plan.done).toEqual(['route-1']);
  });

  it('finishes a Route whose earlier run stopped part-way', () => {
    expect(planScheduleConversion([ROUTE], [], [{ id: 'route-1', recordId: 'schedule-route-1' }]).convert).toHaveLength(1);
    expect(planScheduleConversion([ROUTE], [{ id: 'schedule-route-1' }], []).convert).toHaveLength(1);
  });

  it('leaves a Route that already has another Route Request, and reports it', () => {
    const plan = planScheduleConversion([ROUTE], [], [{ id: 'route-1', recordId: 'email-9' }]);

    expect(plan.convert).toEqual([]);
    expect(plan.hasRouteRequest).toEqual([{ routeId: 'route-1', routeCode: 'W18-26-001', recordId: 'email-9' }]);
  });
});

describe('assertDevelopmentTarget', () => {
  it('allows the development API', () => {
    expect(() => assertDevelopmentTarget({ data: { url: DEV_URL } }, false)).not.toThrow();
  });

  it('refuses any other API unless overridden', () => {
    const outputs = { data: { url: 'https://other.appsync-api.ap-southeast-2.amazonaws.com/graphql' } };
    expect(() => assertDevelopmentTarget(outputs, false)).toThrow(/not the development API/);
    expect(() => assertDevelopmentTarget(outputs, true)).not.toThrow();
  });
});

describe('parseArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseArgs(['node', 'script'])).toMatchObject({ mode: 'dry-run', confirmApply: false, outputsPath: 'amplify_outputs.json' });
  });

  it('reads apply mode and its confirmation', () => {
    expect(parseArgs(['node', 'script', '--mode', 'apply', '--confirm-apply'])).toMatchObject({ mode: 'apply', confirmApply: true });
  });
});
