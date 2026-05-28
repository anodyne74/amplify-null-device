import { parseScheduleText } from './parseSchedule';

describe('parseScheduleText', () => {
  it('parses stop rows, strips NEW prefix, tracks time slots and deduplicates', () => {
    const text = `
      TIME    KEY  PROPERTY
      9:15 - 9:45
      5  NEW - 1/25 Bridge Street, Epping  BO
      5  1/25 Bridge Street, Epping  BO
      12:00 - 12:30
      3  Auction - 5 Kent Street, Epping  AB
    `;

    const result = parseScheduleText(text);

    expect(result.stops).toEqual([
      {
        address: '1/25 Bridge Street, Epping',
        numberOfSigns: 5,
        agent: 'BO',
        isAuction: false,
        timeSlot: '9:15 - 9:45',
      },
      {
        address: '5 Kent Street, Epping',
        numberOfSigns: 3,
        agent: 'AB',
        isAuction: true,
        timeSlot: '12:00 - 12:30',
      },
    ]);
    expect(result.duplicatesRemoved).toEqual(['1/25 Bridge Street, Epping']);
  });

  it('skips auction notice lines and captures unparsed lines', () => {
    const text = `
      12:00
      Auction - 5 Kent Street, Epping
      this line does not match expected columns
    `;

    const result = parseScheduleText(text);

    expect(result.stops).toEqual([]);
    expect(result.unparsedLines).toEqual(['this line does not match expected columns']);
    expect(result.duplicatesRemoved).toEqual([]);
  });

  it('ignores known header and summary lines', () => {
    const text = `
      Allocation of Staff
      Time Key Property
      Betty 8
      Total 8
      \n
    `;

    const result = parseScheduleText(text);

    expect(result).toEqual({
      stops: [],
      unparsedLines: [],
      duplicatesRemoved: [],
    });
  });
});
