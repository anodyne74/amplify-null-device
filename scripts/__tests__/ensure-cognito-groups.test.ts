// The script imports the real AWS SDK client at module scope purely for its `main()`
// path (not needed to exercise REQUIRED_GROUPS) — mock it so importing the module here
// doesn't pull in the SDK's ESM build, which Jest can't transform as-is.
jest.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: jest.fn(),
  GetGroupCommand: jest.fn(),
  CreateGroupCommand: jest.fn(),
  UpdateGroupCommand: jest.fn(),
}));

import { REQUIRED_GROUPS } from '../ensure-cognito-groups.js';

describe('REQUIRED_GROUPS precedence', () => {
  it('gives administrator the lowest precedence number, so it wins for a multi-group account', () => {
    const byName = Object.fromEntries(REQUIRED_GROUPS.map((g) => [g.name, g.precedence]));
    expect(byName.administrator).toBeLessThan(byName.operator);
    expect(byName.operator).toBeLessThan(byName.customer);
  });

  it('contains exactly the three expected groups', () => {
    expect(REQUIRED_GROUPS.map((g) => g.name).sort()).toEqual(['administrator', 'customer', 'operator']);
  });
});
