import { routeLinkCode } from './routeLink';

describe('routeLinkCode', () => {
  it('accepts six characters from the alphabet, in any case', () => {
    expect(routeLinkCode('k7q2m9')).toBe('k7q2m9');
    expect(routeLinkCode('K7Q2M9')).toBe('k7q2m9');
  });

  it('rejects a Route id', () => {
    expect(routeLinkCode('3f2b8c1e-9a4d-4e6b-b7c2-1d5e8f0a9b3c')).toBeNull();
    expect(routeLinkCode('route-1')).toBeNull();
  });

  it('rejects the wrong length and characters outside the alphabet', () => {
    expect(routeLinkCode('k7q2m')).toBeNull();
    expect(routeLinkCode('k7q2m97')).toBeNull();
    expect(routeLinkCode('k7q2m0')).toBeNull();
    expect(routeLinkCode('k7q2ml')).toBeNull();
    expect(routeLinkCode('')).toBeNull();
  });
});
