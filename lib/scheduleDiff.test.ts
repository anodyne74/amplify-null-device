import { scheduleDiff, type DiffStop } from '@/lib/scheduleDiff';

// Invented addresses, laid out as the real sheets are: every case here came from a pattern seen in a customer's sheets.
const stop = (address: string, addressStreetNumber: string, addressStreet: string, addressSuburb: string, addressPostcode = '2999'): DiffStop => ({
  address,
  addressStreetNumber,
  addressStreet,
  addressSuburb,
  addressPostcode,
});

const ALDER = stop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview');
const BIRCH = stop('308/3 Birch Place, Hillview', '3', 'Birch Place', 'Hillview');
const CEDAR = stop('7 Cedar Avenue, North Hillview', '7', 'Cedar Avenue', 'North Hillview');
const ELM = stop('44 Elm Road, Riverbend', '44', 'Elm Road', 'Riverbend', '2998');
const FIG = stop('9/20 Fig Close, Riverbend', '20', 'Fig Close', 'Riverbend', '2998');
const GROVE = stop('15 Grove Crescent, Hillview', '15', 'Grove Crescent', 'Hillview');
const LAST_WEEK = [ALDER, BIRCH, CEDAR, ELM, FIG, GROVE];

const rows = (...addresses: string[]) => addresses.map((address) => ({ address }));

describe('scheduleDiff', () => {
  it('matches a Property however the customer wrote it', () => {
    const diff = scheduleDiff(
      rows('12 Alder St, Hillview', '7 Cedar Avenue North Hillview', '44 Elm Road Riverbend NSW 2998', 'Unit 9, 20 Fig Close, Riverbend'),
      LAST_WEEK
    );
    expect(diff.matched.map(({ stop: s }) => s)).toEqual([ALDER, CEDAR, ELM, FIG]);
    expect(diff.adds).toEqual([]);
    expect(diff.ambiguous).toEqual([]);
  });

  it('lets the comparison, not the New label, decide what is an Add', () => {
    const diff = scheduleDiff(rows('New - 12 Alder Street, Hillview', 'New 7 Cedar Avenue North Hillview', '31 Hazel Road Riverbend'), LAST_WEEK);
    expect(diff.matched.map(({ stop: s }) => s)).toEqual([ALDER, CEDAR]);
    expect(diff.adds).toEqual(rows('31 Hazel Road Riverbend'));
  });

  it('adds rows with no Stop, in sheet order, and drops Stops with no row, in Route order', () => {
    const diff = scheduleDiff(rows('31 Hazel Road Riverbend', '12 Alder Street, Hillview', '2 Iris Lane, Hillview', '44 Elm Road, Riverbend'), LAST_WEEK);
    expect(diff.adds).toEqual(rows('31 Hazel Road Riverbend', '2 Iris Lane, Hillview'));
    expect(diff.drops).toEqual([BIRCH, CEDAR, FIG, GROVE]);
  });

  it('keeps a postcode the sheet does not give from separating Properties', () => {
    const diff = scheduleDiff(rows('44 Elm Road, Riverbend'), LAST_WEEK);
    expect(diff.matched).toHaveLength(1);
  });

  describe('ambiguous rows', () => {
    it('sets aside a row with no suburb', () => {
      const diff = scheduleDiff(rows('5 Kent Street', '5 Kent St,'), LAST_WEEK);
      expect(diff.ambiguous.map(({ reason }) => reason)).toEqual(['No suburb given', 'No suburb given']);
      expect(diff.adds).toEqual([]);
    });

    it('sets aside a row with no street number', () => {
      const diff = scheduleDiff(rows('Open home at the park'), LAST_WEEK);
      expect(diff.ambiguous).toEqual([{ row: { address: 'Open home at the park' }, reason: 'No street number', candidate: undefined }]);
    });

    it('names the Stop a row with the same number and street but another suburb might be, and does not also drop it', () => {
      const diff = scheduleDiff(rows('44 Elm Road, Hillview'), LAST_WEEK);
      expect(diff.ambiguous).toEqual([
        { row: { address: '44 Elm Road, Hillview' }, reason: 'Same number and street as 44 Elm Road, Riverbend, but a different suburb', candidate: ELM },
      ]);
      expect(diff.drops).not.toContain(ELM);
      expect(diff.adds).toEqual([]);
    });

    it('does not take "Hillview" for "North Hillview"', () => {
      const diff = scheduleDiff(rows('7 Cedar Avenue Hillview'), LAST_WEEK);
      expect(diff.matched).toEqual([]);
      expect(diff.ambiguous[0]).toMatchObject({ candidate: CEDAR, reason: expect.stringContaining('different suburb') });
    });

    it('says when only the postcode differs', () => {
      const diff = scheduleDiff(rows('12 Alder Street, Hillview NSW 3000'), LAST_WEEK);
      expect(diff.ambiguous[0].reason).toMatch(/different postcode$/);
    });

    it('says which Stop a row with a street but no suburb may be', () => {
      const diff = scheduleDiff(rows('44 Elm Road'), LAST_WEEK);
      expect(diff.ambiguous[0]).toMatchObject({ reason: 'No suburb given; may be 44 Elm Road, Riverbend', candidate: ELM });
    });
  });

  describe('units', () => {
    it('is the same Property when only the unit changed, and says so', () => {
      const diff = scheduleDiff(rows('309/3 Birch Place, Hillview'), LAST_WEEK);
      expect(diff.matched).toEqual([{ row: { address: '309/3 Birch Place, Hillview' }, stop: BIRCH, unitDiffers: true }]);
      expect(diff.drops).not.toContain(BIRCH);
    });

    it('does not say the unit differs when it does not', () => {
      expect(scheduleDiff(rows('308/3 Birch Pl, Hillview'), LAST_WEEK).matched[0].unitDiffers).toBe(false);
    });

    it('pairs two units in one building with their own Stops, whatever order the sheet lists them', () => {
      const unit1 = stop('1/3 Birch Place, Hillview', '3', 'Birch Place', 'Hillview');
      const unit2 = stop('2/3 Birch Place, Hillview', '3', 'Birch Place', 'Hillview');
      const diff = scheduleDiff(rows('2/3 Birch Place, Hillview', '1/3 Birch Place, Hillview'), [unit1, unit2]);
      expect(diff.matched.map(({ stop: s, unitDiffers }) => [s, unitDiffers])).toEqual([[unit2, false], [unit1, false]]);
    });

    it('adds a second unit in a building when its Stop is already taken', () => {
      const diff = scheduleDiff(rows('308/3 Birch Place, Hillview', '5/3 Birch Place, Hillview'), [BIRCH]);
      expect(diff.matched).toHaveLength(1);
      expect(diff.adds).toEqual(rows('5/3 Birch Place, Hillview'));
    });

    it('sets aside an address listed twice', () => {
      const diff = scheduleDiff(rows('12 Alder Street, Hillview', '12 Alder St Hillview'), LAST_WEEK);
      expect(diff.matched).toHaveLength(1);
      expect(diff.ambiguous).toEqual([{ row: { address: '12 Alder St Hillview' }, reason: 'Listed more than once on the sheet', candidate: ALDER }]);
      expect(diff.adds).toEqual([]);
    });
  });

  it('drops a Stop whose own address cannot be read as a Property', () => {
    const odd: DiffStop = { address: 'Yard pickup' };
    expect(scheduleDiff(rows('12 Alder Street, Hillview'), [ALDER, odd]).drops).toEqual([odd]);
  });

  it('works out a whole week against the Route copied from the week before', () => {
    const thisWeek = rows(
      '12 Alder Street, Hillview', // unchanged
      '7 Cedar Avenue North Hillview', // unchanged, written without a comma
      '309/3 Birch Place, Hillview', // another unit
      '44 Elm Road Riverbend', // unchanged
      'New - 31 Hazel Road Riverbend', // added
      '5 Kent Street', // no suburb
      '2 Iris Lane, Hillview' // added
    );
    const diff = scheduleDiff(thisWeek, LAST_WEEK);
    expect(diff.matched.map(({ stop: s }) => s)).toEqual([ALDER, CEDAR, BIRCH, ELM]);
    expect(diff.adds).toEqual(rows('New - 31 Hazel Road Riverbend', '2 Iris Lane, Hillview'));
    expect(diff.ambiguous.map(({ row }) => row.address)).toEqual(['5 Kent Street']);
    expect(diff.drops).toEqual([FIG, GROVE]);
  });

  it('proposes nothing for an empty sheet except dropping every Stop', () => {
    expect(scheduleDiff([], LAST_WEEK).drops).toEqual(LAST_WEEK);
  });
});
