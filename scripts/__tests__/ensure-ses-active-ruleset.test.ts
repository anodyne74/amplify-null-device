import { readFileSync } from 'node:fs';

// The script imports the real AWS SDK client at module scope purely for its `main()`
// path -- mock it so importing the module here doesn't pull in the SDK's ESM build,
// which Jest can't transform as-is (same reasoning as ensure-cognito-groups.test.ts).
jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(),
  DescribeActiveReceiptRuleSetCommand: jest.fn((input) => ({ input })),
  SetActiveReceiptRuleSetCommand: jest.fn((input) => ({ input })),
}));

jest.mock('node:fs', () => ({ readFileSync: jest.fn() }));

import { loadRuleSetName, ensureActive } from '../ensure-ses-active-ruleset.js';

describe('loadRuleSetName', () => {
  it('reads the rule set name and region out of amplify_outputs.json', () => {
    (readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        auth: { aws_region: 'ap-southeast-2' },
        custom: { sesInboundRuleSetName: 'inbound-rule-set-nulldevice-development' },
      }),
    );

    expect(loadRuleSetName('amplify_outputs.json')).toEqual({
      ruleSetName: 'inbound-rule-set-nulldevice-development',
      region: 'ap-southeast-2',
    });
  });

  it('throws when custom.sesInboundRuleSetName is missing (e.g. local placeholder outputs)', () => {
    (readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ auth: { aws_region: 'ap-southeast-2' } }));

    expect(() => loadRuleSetName('amplify_outputs.json')).toThrow(/sesInboundRuleSetName/);
  });
});

describe('ensureActive', () => {
  it('does nothing when the target rule set is already active', async () => {
    const send = jest.fn().mockResolvedValue({ Metadata: { Name: 'inbound-rule-set-nulldevice-development' } });
    const client = { send };

    await ensureActive(client, 'inbound-rule-set-nulldevice-development');

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('activates the target rule set when a different (or no) rule set is active', async () => {
    const send = jest
      .fn()
      .mockResolvedValueOnce({ Metadata: { Name: 'inbound-rule-set-nulldevice-dev' } })
      .mockResolvedValueOnce({});
    const client = { send };

    await ensureActive(client, 'inbound-rule-set-nulldevice-development');

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual({ input: { RuleSetName: 'inbound-rule-set-nulldevice-development' } });
  });

  it('activates when no rule set is currently active at all', async () => {
    const send = jest.fn().mockResolvedValueOnce({}).mockResolvedValueOnce({});
    const client = { send };

    await ensureActive(client, 'inbound-rule-set-nulldevice-development');

    expect(send).toHaveBeenCalledTimes(2);
  });
});
