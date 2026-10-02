import { australianMobile, maskedMobile } from './operatorMobile';

describe('australianMobile', () => {
  it.each(['0412 345 678', '0412345678', '+61 412 345 678', '61412345678', '(04) 1234-5678', '+61412345678'])(
    'reads %s as an Australian mobile',
    (raw) => {
      expect(australianMobile(raw)).toEqual({ international: '+61412345678', local: '0412 345 678' });
    },
  );

  it.each([
    ['empty', ''],
    ['missing', null],
    ['a landline', '02 9876 5432'],
    ['too short', '0412 345 67'],
    ['too long', '0412 345 6789'],
    ['another country', '+64 21 123 4567'],
    ['words', 'call the office'],
  ])('is not a mobile when %s', (_label, raw) => {
    expect(australianMobile(raw)).toBeNull();
  });
});

describe('maskedMobile', () => {
  it('hides all but the start and the last three digits', () => {
    expect(maskedMobile(australianMobile('0412 345 678')!)).toBe('0412 *** 678');
  });
});
