import { isSingleSms, notifyOperatorText, textDate } from './notifyOperatorText';

const routeLink = 'https://www.nulldevice.dev/r/3f2b8c1e-9a4d-4e6b-b7c2-1d5e8f0a9b3c';

describe('textDate', () => {
  it('writes the scheduled date as weekday, day and month, without moving it across time zones', () => {
    expect(textDate('2026-10-07')).toBe('Wed 7 Oct');
    expect(textDate('2026-01-01')).toBe('Thu 1 Jan');
  });

  it('says the date is to be confirmed when the Route has none', () => {
    expect(textDate(null)).toBe('date to be confirmed');
    expect(textDate(undefined)).toBe('date to be confirmed');
    expect(textDate('next week')).toBe('date to be confirmed');
  });
});

describe('notifyOperatorText', () => {
  it('names the Route, Customer, Stop count and date, with a link to the Route', () => {
    const text = notifyOperatorText({
      routeCode: 'W40-26-007',
      customerName: 'Ray White Parramatta',
      stopCount: 12,
      scheduledDate: '2026-10-07',
      routeLink,
    });

    expect(text).toBe(`NullDevice: Route W40-26-007 for Ray White Parramatta, 12 stops, Wed 7 Oct. ${routeLink}`);
    expect(isSingleSms(text)).toBe(true);
  });

  it('says "1 stop" and "date to be confirmed" when they apply', () => {
    const text = notifyOperatorText({
      routeCode: 'W40-26-008',
      customerName: 'McGrath',
      stopCount: 1,
      scheduledDate: null,
      routeLink,
    });

    expect(text).toBe(`NullDevice: Route W40-26-008 for McGrath, 1 stop, date to be confirmed. ${routeLink}`);
  });

  it('shortens only the Customer name, ending it with "...", when the text would not fit in one SMS', () => {
    const text = notifyOperatorText({
      routeCode: 'W40-26-009',
      customerName: 'Laing+Simmons Young Property Group Cronulla and the Sutherland Shire',
      stopCount: 24,
      scheduledDate: null,
      routeLink,
    });

    expect(text).toHaveLength(160);
    expect(isSingleSms(text)).toBe(true);
    expect(text).toMatch(/^NullDevice: Route W40-26-009 for Laing\+Simmons .+\.\.\., 24 stops, date to be confirmed\. https:/);
    expect(text.endsWith(routeLink)).toBe(true);
  });

  it('swaps characters outside the basic SMS alphabet so one text never becomes several', () => {
    const text = notifyOperatorText({
      routeCode: 'W40-26-010',
      customerName: 'O’Brien & Co — Real Estate 🏠',
      stopCount: 3,
      scheduledDate: '2026-10-07',
      routeLink,
    });

    expect(text).toContain("for O'Brien & Co - Real Estate, 3 stops");
    expect(isSingleSms(text)).toBe(true);
  });

  it('falls back to "a customer" when the name is blank', () => {
    const text = notifyOperatorText({ routeCode: 'W40-26-011', customerName: '  ', stopCount: 2, routeLink });
    expect(text).toContain('for a customer, 2 stops');
  });
});

describe('isSingleSms', () => {
  it('is false past 160 characters or with a character outside the basic SMS alphabet', () => {
    expect(isSingleSms('a'.repeat(160))).toBe(true);
    expect(isSingleSms('a'.repeat(161))).toBe(false);
    expect(isSingleSms('hello 🙂')).toBe(false);
  });
});
