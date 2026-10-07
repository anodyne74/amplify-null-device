import { billToName } from '@/lib/billToName';

describe('billToName', () => {
  it('is the Trading Name when it is set', () => {
    expect(billToName({ companyName: 'Acme Realty Pty Ltd', name: 'Pat Owner' }, 'c-1')).toBe('Acme Realty Pty Ltd');
  });

  it('trims the Trading Name', () => {
    expect(billToName({ companyName: '  Acme Realty  ', name: 'Pat Owner' }, 'c-1')).toBe('Acme Realty');
  });

  it.each([
    ['blank', '   '],
    ['empty', ''],
    ['null', null],
    ['missing', undefined],
  ])('falls back to the name when the Trading Name is %s', (_label, companyName) => {
    expect(billToName({ companyName, name: 'Pat Owner' }, 'c-1')).toBe('Pat Owner');
  });

  it('falls back to the id when there is neither', () => {
    expect(billToName({ companyName: ' ', name: ' ' }, 'c-1')).toBe('c-1');
    expect(billToName(undefined, 'c-1')).toBe('c-1');
  });
});
