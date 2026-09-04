const sesSendMock = jest.fn();
let customOutputsMock: Record<string, string | undefined> = {};

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: sesSendMock })),
  SendTemplatedEmailCommand: jest.fn(function SendTemplatedEmailCommand(this: any, input: unknown) {
    this.input = input;
  }),
}));

jest.mock('@/lib/amplifyOutputsCustom', () => ({
  get customOutputs() {
    return customOutputsMock;
  },
}));

const BASE_INPUT = {
  toEmail: 'jamie@nulldevice.com.au',
  inviteeName: 'Jamie Driver',
  roleLabel: 'Operator',
  inviterName: 'Dana Admin',
  inviterEmail: 'dana@nulldevice.com.au',
  temporaryPassword: 'Temp-Pass-9xKq',
};

async function loadSubject() {
  let mod: typeof import('./staffInvitationEmail');
  await jest.isolateModulesAsync(async () => {
    mod = await import('./staffInvitationEmail');
  });
  return mod!;
}

describe('sendStaffInvitationEmail', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    delete process.env.SES_STAFF_INVITATION_TEMPLATE_NAME;
    delete process.env.AWS_BRANCH;
    delete process.env.AMPLIFY_BRANCH;
    delete process.env.SES_COMPANY_ADDRESS;
    process.env.NEXT_PUBLIC_APP_URL = 'https://portal.example.com';
    customOutputsMock = {};
    sesSendMock.mockResolvedValue({ MessageId: 'ses-1' });
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('sends the templated email with every template variable populated', async () => {
    const { sendStaffInvitationEmail } = await loadSubject();
    await sendStaffInvitationEmail({ ...BASE_INPUT });

    expect(sesSendMock).toHaveBeenCalledTimes(1);
    const command = sesSendMock.mock.calls[0][0];
    expect(command.input.Destination).toEqual({ ToAddresses: ['jamie@nulldevice.com.au'] });

    const data = JSON.parse(command.input.TemplateData);
    expect(data).toEqual(
      expect.objectContaining({
        roleLabel: 'Operator',
        inviteeEmail: 'jamie@nulldevice.com.au',
        inviteeName: 'Jamie Driver',
        temporaryPassword: 'Temp-Pass-9xKq',
        expiryDays: '7',
        portalUrl: 'https://portal.example.com/',
        logoUrl: 'https://portal.example.com/logo.svg',
        companyAddress: 'Melbourne, Australia',
      })
    );
  });

  it('falls back to "there" when no invitee name is given', async () => {
    const { sendStaffInvitationEmail } = await loadSubject();
    await sendStaffInvitationEmail({ ...BASE_INPUT, inviteeName: undefined });
    const data = JSON.parse(sesSendMock.mock.calls[0][0].input.TemplateData);
    expect(data.inviteeName).toBe('there');
  });

  it('derives a branch-suffixed template name from AWS_BRANCH', async () => {
    process.env.AWS_BRANCH = 'feat/My_Branch';
    const { sendStaffInvitationEmail } = await loadSubject();
    await sendStaffInvitationEmail({ ...BASE_INPUT });
    expect(sesSendMock.mock.calls[0][0].input.Template).toBe(
      'NullDeviceStaffInvitationTemplate-feat-my-branch'
    );
  });

  it('prefers the deploy-time custom output over reconstructing AWS_BRANCH at runtime', async () => {
    // AWS_BRANCH/AMPLIFY_BRANCH aren't set in the SSR runtime -- this is the
    // real-world case amplify_outputs.json's `custom` section exists to cover.
    customOutputsMock.sesStaffInvitationTemplateName = 'NullDeviceStaffInvitationTemplate-development';
    const { sendStaffInvitationEmail } = await loadSubject();
    await sendStaffInvitationEmail({ ...BASE_INPUT });
    expect(sesSendMock.mock.calls[0][0].input.Template).toBe(
      'NullDeviceStaffInvitationTemplate-development'
    );
  });

  it('still lets an explicit SES_STAFF_INVITATION_TEMPLATE_NAME override the custom output', async () => {
    customOutputsMock.sesStaffInvitationTemplateName = 'NullDeviceStaffInvitationTemplate-development';
    process.env.SES_STAFF_INVITATION_TEMPLATE_NAME = 'NullDeviceStaffInvitationTemplate-override';
    const { sendStaffInvitationEmail } = await loadSubject();
    await sendStaffInvitationEmail({ ...BASE_INPUT });
    expect(sesSendMock.mock.calls[0][0].input.Template).toBe(
      'NullDeviceStaffInvitationTemplate-override'
    );
  });

  it('propagates SES failures to the caller', async () => {
    sesSendMock.mockRejectedValueOnce(new Error('SES down'));
    const { sendStaffInvitationEmail } = await loadSubject();
    await expect(sendStaffInvitationEmail({ ...BASE_INPUT })).rejects.toThrow('SES down');
  });
});
