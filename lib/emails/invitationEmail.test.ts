const sesSendMock = jest.fn();

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(() => ({ send: sesSendMock })),
  SendTemplatedEmailCommand: jest.fn(function SendTemplatedEmailCommand(this: any, input: unknown) {
    this.input = input;
  }),
}));

const BASE_INPUT = {
  toEmail: 'jamie@rangeproperty.com.au',
  inviteeName: 'Jamie Teammate',
  customerName: 'Range Property',
  inviterName: 'Dana Owner',
  inviterEmail: 'dana@rangeproperty.com.au',
  temporaryPassword: 'Temp-Pass-9xKq',
};

async function loadSubject() {
  let mod: typeof import('./invitationEmail');
  await jest.isolateModulesAsync(async () => {
    mod = await import('./invitationEmail');
  });
  return mod!;
}

describe('sendInvitationEmail', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...OLD_ENV };
    delete process.env.SES_INVITATION_TEMPLATE_NAME;
    delete process.env.AWS_BRANCH;
    delete process.env.AMPLIFY_BRANCH;
    delete process.env.SES_COMPANY_ADDRESS;
    process.env.NEXT_PUBLIC_APP_URL = 'https://portal.example.com';
    sesSendMock.mockResolvedValue({ MessageId: 'ses-1' });
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  it('sends the templated email with every template variable populated', async () => {
    const { sendInvitationEmail } = await loadSubject();
    await sendInvitationEmail({ ...BASE_INPUT });

    expect(sesSendMock).toHaveBeenCalledTimes(1);
    const command = sesSendMock.mock.calls[0][0];
    expect(command.input.Destination).toEqual({ ToAddresses: ['jamie@rangeproperty.com.au'] });

    const data = JSON.parse(command.input.TemplateData);
    const expectedKeys = [
      'customerName', 'inviterName', 'inviterEmail', 'inviteeName', 'inviteeEmail',
      'temporaryPassword', 'expiryDays', 'portalUrl', 'resetPasswordUrl', 'supportUrl',
      'unsubscribeUrl', 'logoUrl', 'companyAddress',
    ];
    for (const key of expectedKeys) {
      expect(data[key]).toBeTruthy();
    }
    expect(data).toEqual(
      expect.objectContaining({
        customerName: 'Range Property',
        inviteeEmail: 'jamie@rangeproperty.com.au',
        inviteeName: 'Jamie Teammate',
        temporaryPassword: 'Temp-Pass-9xKq',
        expiryDays: '7',
        portalUrl: 'https://portal.example.com/',
        logoUrl: 'https://portal.example.com/logo.svg',
        unsubscribeUrl: 'https://portal.example.com/customer/settings',
        companyAddress: 'Melbourne, Australia',
      })
    );
    expect(data.resetPasswordUrl).toMatch(/^mailto:/);
    expect(data.supportUrl).toMatch(/^mailto:/);
  });

  it('falls back to "there" when no invitee name is given', async () => {
    const { sendInvitationEmail } = await loadSubject();
    await sendInvitationEmail({ ...BASE_INPUT, inviteeName: undefined });
    const data = JSON.parse(sesSendMock.mock.calls[0][0].input.TemplateData);
    expect(data.inviteeName).toBe('there');
  });

  it('uses SES_COMPANY_ADDRESS and SES_INVITATION_TEMPLATE_NAME when set', async () => {
    process.env.SES_COMPANY_ADDRESS = 'Level 3, 100 Collins St, Melbourne VIC 3000';
    process.env.SES_INVITATION_TEMPLATE_NAME = 'NullDeviceInvitationTemplate-feature-x';
    const { sendInvitationEmail } = await loadSubject();
    await sendInvitationEmail({ ...BASE_INPUT });

    const command = sesSendMock.mock.calls[0][0];
    expect(command.input.Template).toBe('NullDeviceInvitationTemplate-feature-x');
    const data = JSON.parse(command.input.TemplateData);
    expect(data.companyAddress).toBe('Level 3, 100 Collins St, Melbourne VIC 3000');
  });

  it('derives a branch-suffixed template name from AWS_BRANCH', async () => {
    process.env.AWS_BRANCH = 'feat/My_Branch';
    const { sendInvitationEmail } = await loadSubject();
    await sendInvitationEmail({ ...BASE_INPUT });
    expect(sesSendMock.mock.calls[0][0].input.Template).toBe('NullDeviceInvitationTemplate-feat-my-branch');
  });

  it('propagates SES failures to the caller', async () => {
    sesSendMock.mockRejectedValueOnce(new Error('SES down'));
    const { sendInvitationEmail } = await loadSubject();
    await expect(sendInvitationEmail({ ...BASE_INPUT })).rejects.toThrow('SES down');
  });
});
