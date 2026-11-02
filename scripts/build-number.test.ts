import { formatBuildNumber, resolveBuildNumber } from './build-number';

describe('formatBuildNumber', () => {
  it('joins the commit date, short commit and job', () => {
    expect(
      formatBuildNumber({ commitId: 'a6f6444abcdef1234567', commitDate: '20261102', jobId: '64' }),
    ).toBe('20261102-a6f6444-64');
  });

  it('is unknown when any piece is missing', () => {
    expect(formatBuildNumber({ commitId: 'a6f6444', commitDate: undefined, jobId: '64' })).toBe('unknown');
    expect(formatBuildNumber({ commitId: undefined, commitDate: '20261102', jobId: '64' })).toBe('unknown');
  });
});

describe('resolveBuildNumber', () => {
  it('is local outside an Amplify deploy', () => {
    expect(resolveBuildNumber({}, () => '20261102')).toBe('local');
  });

  it('is unknown in a deploy that lost its commit', () => {
    expect(resolveBuildNumber({ AWS_JOB_ID: '64' }, () => '20261102', () => undefined)).toBe('unknown');
  });

  it('is unknown when git cannot give the commit date', () => {
    expect(resolveBuildNumber({ AWS_JOB_ID: '64', AWS_COMMIT_ID: 'a6f6444' }, () => undefined)).toBe('unknown');
  });

  it('reads the commit from the checkout when Amplify says HEAD', () => {
    expect(
      resolveBuildNumber({ AWS_JOB_ID: '64', AWS_COMMIT_ID: 'HEAD' }, () => '20261102', () => 'a6f6444abcdef12'),
    ).toBe('20261102-a6f6444-64');
  });

  it('is unknown when HEAD cannot be resolved', () => {
    expect(resolveBuildNumber({ AWS_JOB_ID: '64', AWS_COMMIT_ID: 'HEAD' }, () => '20261102', () => undefined)).toBe(
      'unknown',
    );
  });

  it('builds the number in a deploy', () => {
    expect(resolveBuildNumber({ AWS_JOB_ID: '64', AWS_COMMIT_ID: 'a6f6444abc' }, () => '20261102')).toBe(
      '20261102-a6f6444-64',
    );
  });
});
