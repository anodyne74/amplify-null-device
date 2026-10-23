import { amendmentDiff } from '@/lib/amendmentDiff';

const stop = (address: string) => ({ address });
const ROUTE = [
  stop('7 Carlingford Road, Epping NSW 2121'),
  stop('20 Gloucester Road, Epping NSW 2121'),
  stop('5 Other Street, Eastwood NSW 2122'),
];

describe('amendmentDiff', () => {
  it("adds the properties an email states, taking the suburb from the Route's Stops on that street", () => {
    const rows = [
      { address: '3/13 Carlingford Road', change: 'add' as const },
      { address: '15/13 Carlingford Road', change: 'add' as const },
    ];
    const diff = amendmentDiff(rows, ROUTE);
    expect(diff.adds.map((item) => [item.row.address, item.inferredSuburb])).toEqual([
      ['3/13 Carlingford Road', true],
      ['15/13 Carlingford Road', true],
    ]);
    expect(diff.drops).toEqual([]);
    expect(diff.ambiguous).toEqual([]);
    expect(diff.notOnSchedule).toEqual([]);
  });

  it('leaves a property with no suburb to check by hand when the Route has no Stop on that street, or its Stops disagree', () => {
    const elsewhere = amendmentDiff([{ address: '9 Nowhere Avenue', change: 'add' as const }], ROUTE);
    expect(elsewhere.ambiguous.map((item) => item.reason)).toEqual(['No suburb given']);
    expect(elsewhere.adds).toEqual([]);

    const split = [stop('4 Long Road, Epping NSW 2121'), stop('8 Long Road, Eastwood NSW 2122')];
    const disagree = amendmentDiff([{ address: '6 Long Road', change: 'add' as const }], split);
    expect(disagree.adds).toEqual([]);
    expect(disagree.ambiguous).toHaveLength(1);
  });

  it('keeps a suburb the email gave', () => {
    const diff = amendmentDiff([{ address: '7 New Street, Marsfield', change: 'add' as const }], ROUTE);
    expect(diff.adds.map((item) => [item.row.address, item.inferredSuburb])).toEqual([['7 New Street, Marsfield', false]]);
  });

  it('shows a unit at a building the Route already visits as matched, with the unit difference noted', () => {
    const diff = amendmentDiff([{ address: '3/7 Carlingford Road', change: 'add' as const }], ROUTE);
    expect(diff.adds).toEqual([]);
    expect(diff.alreadyOn.map((item) => [item.stop.address, item.unitDiffers])).toEqual([['7 Carlingford Road, Epping NSW 2121', true]]);
  });

  it('shows a property already on the Route as already there, not an add', () => {
    const diff = amendmentDiff([{ address: '20 Gloucester Road', change: 'add' as const }], ROUTE);
    expect(diff.adds).toEqual([]);
    expect(diff.alreadyOn.map((item) => item.stop.address)).toEqual(['20 Gloucester Road, Epping NSW 2121']);
  });

  it('proposes dropping the Stop an email asks to take off, and says when the Route has none there', () => {
    const diff = amendmentDiff(
      [
        { address: '5 Other Street, Eastwood', change: 'drop' as const },
        { address: '99 Missing Street, Epping', change: 'drop' as const },
      ],
      ROUTE
    );
    expect(diff.drops.map((item) => item.stop.address)).toEqual(['5 Other Street, Eastwood NSW 2122']);
    expect(diff.notOnRoute.map((row) => row.address)).toEqual(['99 Missing Street, Epping']);
    expect(diff.adds).toEqual([]);
  });

  it('only flags the Stops a revised Schedule leaves out', () => {
    const diff = amendmentDiff([{ address: '20 Gloucester Road, Epping' }, { address: '30 Fresh Street, Epping' }], ROUTE);
    expect(diff.adds.map((item) => item.row.address)).toEqual(['30 Fresh Street, Epping']);
    expect(diff.drops).toEqual([]);
    expect(diff.notOnSchedule.map((item) => item.address)).toEqual([
      '7 Carlingford Road, Epping NSW 2121',
      '5 Other Street, Eastwood NSW 2122',
    ]);
  });

  it('does not flag a Stop the email itself asks to drop as missing from the Schedule', () => {
    const diff = amendmentDiff([{ address: '20 Gloucester Road, Epping' }, { address: '5 Other Street, Eastwood', change: 'drop' as const }], ROUTE);
    expect(diff.drops).toHaveLength(1);
    expect(diff.notOnSchedule.map((item) => item.address)).toEqual(['7 Carlingford Road, Epping NSW 2121']);
  });

  it('flags nothing as missing when the Amendment is only the email', () => {
    expect(amendmentDiff([{ address: '3/13 Carlingford Road', change: 'add' as const }], ROUTE).notOnSchedule).toEqual([]);
  });

  it('is empty for no rows', () => {
    expect(amendmentDiff([], ROUTE)).toEqual({ adds: [], drops: [], alreadyOn: [], notOnRoute: [], ambiguous: [], notOnSchedule: [] });
  });
});
