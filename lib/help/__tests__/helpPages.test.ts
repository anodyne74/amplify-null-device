import {
  canSeeHelpPage,
  fillHelpPlaceholders,
  helpPageForPath,
  parseHelpPage,
  selectFlaggedText,
  type HelpPage,
} from '@/lib/help/helpPages';

const page = (overrides: Partial<HelpPage> = {}): HelpPage => ({
  slug: 'route-defaults',
  title: 'Route Defaults',
  summary: 'What every new route starts from.',
  order: 7,
  role: 'any',
  flag: null,
  screens: [],
  body: '',
  ...overrides,
});

describe('parseHelpPage', () => {
  it('reads the front matter and keeps the body', () => {
    const parsed = parseHelpPage(
      'route-defaults',
      [
        '---',
        'title: Route Defaults',
        'summary: What every new route starts from.',
        'order: 7',
        'role: account_owner',
        'flag: property-history',
        'screens: /customer/route-defaults, /customer/settings',
        '---',
        '',
        'Body text.',
      ].join('\n')
    );

    expect(parsed).toEqual({
      slug: 'route-defaults',
      title: 'Route Defaults',
      summary: 'What every new route starts from.',
      order: 7,
      role: 'account_owner',
      flag: 'property-history',
      screens: ['/customer/route-defaults', '/customer/settings'],
      body: 'Body text.',
    });
  });

  it('defaults to any role, no flag and no screens', () => {
    const parsed = parseHelpPage('glossary', '---\ntitle: Glossary\nsummary: Words.\norder: 11\n---\nText');
    expect(parsed).toMatchObject({ role: 'any', flag: null, screens: [] });
  });

  it.each([
    ['no front matter', 'Just text'],
    ['no title', '---\nsummary: s\norder: 1\n---\n'],
    ['no order', '---\ntitle: t\nsummary: s\n---\n'],
    ['an unknown role', '---\ntitle: t\nsummary: s\norder: 1\nrole: admin\n---\n'],
    ['an unknown flag', '---\ntitle: t\nsummary: s\norder: 1\nflag: nope\n---\n'],
    ['an unknown key', '---\ntitle: t\nsummary: s\norder: 1\ncolour: red\n---\n'],
  ])('refuses a page with %s', (_case, source) => {
    expect(() => parseHelpPage('x', source)).toThrow(/help page x/i);
  });
});

describe('canSeeHelpPage', () => {
  const isOn = (...on: string[]) => (flag: string) => on.includes(flag);

  it('shows an any-role page to a read-only user', () => {
    expect(canSeeHelpPage(page(), { role: 'read_only', isOn: isOn() })).toBe(true);
  });

  it('shows an Account Owner page only to an Account Owner', () => {
    const owners = page({ role: 'account_owner' });
    expect(canSeeHelpPage(owners, { role: 'account_owner', isOn: isOn() })).toBe(true);
    expect(canSeeHelpPage(owners, { role: 'read_only', isOn: isOn() })).toBe(false);
  });

  it('shows a flagged page only while its flag is on', () => {
    const flagged = page({ flag: 'property-history' });
    expect(canSeeHelpPage(flagged, { role: 'account_owner', isOn: isOn('property-history') })).toBe(true);
    expect(canSeeHelpPage(flagged, { role: 'account_owner', isOn: isOn() })).toBe(false);
  });
});

describe('helpPageForPath', () => {
  const pages = [
    page({ slug: 'follow-a-route', screens: ['/customer/routes'] }),
    page({ slug: 'users', screens: ['/customer/users'] }),
  ];

  it('finds the page for a screen and for the screens beneath it', () => {
    expect(helpPageForPath('/customer/routes', pages)?.slug).toBe('follow-a-route');
    expect(helpPageForPath('/customer/routes/abc', pages)?.slug).toBe('follow-a-route');
  });

  it('does not match a screen that only shares a prefix', () => {
    expect(helpPageForPath('/customer/users-extra', pages)).toBeNull();
  });

  it('has no page for a screen no page claims', () => {
    expect(helpPageForPath('/customer/invoices', pages)).toBeNull();
  });
});

describe('fillHelpPlaceholders', () => {
  it('fills in the email addresses for this branch', () => {
    expect(fillHelpPlaceholders('Email {{requestsEmail}} or {{supportEmail}}.', { requestsEmail: 'r@x', supportEmail: 's@x' })).toBe(
      'Email r@x or s@x.'
    );
  });

  it('refuses an unknown placeholder, so a typo never reaches a Customer', () => {
    expect(() => fillHelpPlaceholders('Email {{requestEmail}}.', { requestsEmail: 'r@x' })).toThrow(/requestEmail/);
  });
});

describe('selectFlaggedText', () => {
  const source = 'Before.\n\n:::if account-owner-invite\nInvite them.\n:::else\nAsk us.\n:::end\n\nAfter.';

  it('keeps the flagged text while the flag is on', () => {
    expect(selectFlaggedText(source, (flag) => flag === 'account-owner-invite')).toBe('Before.\n\nInvite them.\n\nAfter.');
  });

  it('keeps the other text while the flag is off', () => {
    expect(selectFlaggedText(source, () => false)).toBe('Before.\n\nAsk us.\n\nAfter.');
  });

  it('allows a block with no else', () => {
    expect(selectFlaggedText(':::if property-history\nSearch.\n:::end', () => false)).toBe('');
  });

  it('refuses an unknown flag or an unclosed block', () => {
    expect(() => selectFlaggedText(':::if nope\nx\n:::end', () => true)).toThrow(/nope/);
    expect(() => selectFlaggedText(':::if property-history\nx', () => true)).toThrow(/unclosed/i);
  });

  it('refuses a stray :::else or :::end, or a block inside a block', () => {
    expect(() => selectFlaggedText('x\n:::else\ny', () => true)).toThrow(/:::else/);
    expect(() => selectFlaggedText('x\n:::end', () => true)).toThrow(/:::end/);
    expect(() =>
      selectFlaggedText(':::if property-history\n:::if account-owner-invite\nx\n:::end\n:::end', () => true)
    ).toThrow(/inside/i);
  });
});
