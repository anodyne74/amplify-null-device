/**
 * @jest-environment node
 */
describe('devpreview fixtures', () => {
  afterEach(() => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_DEVPREVIEW;
  });

  it('are off unless NEXT_PUBLIC_DEVPREVIEW is 1', async () => {
    const off = await import('@/lib/devFixtures');
    expect(off.DEVPREVIEW).toBe(false);
    expect(off.isFixtureRouteId('fixture-16')).toBe(false);

    jest.resetModules();
    process.env.NEXT_PUBLIC_DEVPREVIEW = '1';
    const on = await import('@/lib/devFixtures');
    expect(on.isFixtureRouteId('fixture-16')).toBe(true);
    expect(on.isFixtureRouteId('some-real-route')).toBe(false);
  });

  it('offers a 16-Stop Route, an Auction Stop, a long name and a Route with a Stop removed at the door', async () => {
    process.env.NEXT_PUBLIC_DEVPREVIEW = '1';
    const { fixtureRouteWithStops } = await import('@/lib/devFixtures');

    const sixteen = fixtureRouteWithStops('fixture-16');
    expect(sixteen.stops).toHaveLength(16);
    expect(sixteen.stops.some((s) => s.isAuction)).toBe(true);
    expect(sixteen.stops.some((s) => (s.agent ?? '').length > 25)).toBe(true);
    expect(sixteen.route.executionPhase).toBe('placement');

    const removed = fixtureRouteWithStops('fixture-removed');
    expect(removed.stops.filter((s) => s.removed && s.removedReason)).toHaveLength(1);
    expect(fixtureRouteWithStops('fixture-2').stops).toHaveLength(2);
  });
});
