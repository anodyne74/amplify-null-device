import { findUnusableMobiles, isAustralianMobile } from '../report-unusable-operator-mobiles.js';
import { australianMobile } from '@/lib/operatorMobile';

describe('findUnusableMobiles', () => {
  it('lists Operators whose number is not an Australian mobile, skipping usable and empty ones', () => {
    const operators = [
      { id: 'o1', name: 'Jane', email: 'jane@nulldevice.dev', phone: '0412 345 678' },
      { id: 'o2', name: 'Sam', email: 'sam@nulldevice.dev', phone: '+61412345678' },
      { id: 'o3', name: 'Lee', email: 'lee@nulldevice.dev', phone: '02 9876 5432' },
      { id: 'o4', name: 'Kim', email: 'kim@nulldevice.dev', phone: null },
      { id: 'o5', name: 'Ash', email: null, phone: 'ring the office' },
      { id: 'o6', name: 'Max', email: 'max@nulldevice.dev', phone: '  ' },
    ];

    expect(findUnusableMobiles(operators)).toEqual([
      { id: 'o3', name: 'Lee', email: 'lee@nulldevice.dev', phone: '02 9876 5432' },
      { id: 'o5', name: 'Ash', email: null, phone: 'ring the office' },
    ]);
  });
});

describe('isAustralianMobile', () => {
  it.each(['0412 345 678', '+61 412 345 678', '61412345678', '(04) 1234-5678', '02 9876 5432', '0412 345 67', '+64 21 123 4567', ''])(
    'agrees with lib/operatorMobile.ts about %p',
    (raw) => {
      expect(isAustralianMobile(raw)).toBe(australianMobile(raw) !== null);
    }
  );
});
