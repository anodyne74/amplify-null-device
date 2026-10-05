import { sesTemplateName } from './sesTemplateName';

describe('sesTemplateName', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.AWS_BRANCH;
    delete process.env.AMPLIFY_BRANCH;
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('prefers the env-var override, then the deployed name', () => {
    expect(sesTemplateName('NullDeviceX', { override: 'Override', deployed: 'NullDeviceX-development' })).toBe('Override');
    expect(sesTemplateName('NullDeviceX', { deployed: 'NullDeviceX-development' })).toBe('NullDeviceX-development');
  });

  it('falls back to the name backend.ts would give this branch', () => {
    process.env.AWS_BRANCH = 'Feature/Missing_Signs';
    expect(sesTemplateName('NullDeviceX', {})).toBe('NullDeviceX-feature-missing-signs');
  });

  it('falls back to the bare name with no branch', () => {
    expect(sesTemplateName('NullDeviceX', {})).toBe('NullDeviceX');
  });
});
