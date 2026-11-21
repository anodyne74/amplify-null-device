import {
  getLandingRedirect,
  loginPathFor,
  returnPath,
  getCustomerRouteRedirect,
  getOperatorRouteRedirect,
  getAdminRouteRedirect,
  PENDING_APPROVAL_PATH,
  RoleFlags,
} from './auth-routing';

const flags = (groups: string[]): RoleFlags => ({
  isAdmin: groups.includes('administrator'),
  isOperator: groups.includes('operator'),
  isCustomer: groups.includes('customer'),
});

describe('getLandingRedirect', () => {
  it('sends administrator-only users to /administrator', () => {
    expect(getLandingRedirect(['administrator'])).toBe('/administrator');
  });

  it('sends operator-only users to /operator/dashboard', () => {
    expect(getLandingRedirect(['operator'])).toBe('/operator/dashboard');
  });

  it('sends customer-only users to /customer/dashboard', () => {
    expect(getLandingRedirect(['customer'])).toBe('/customer/dashboard');
  });

  it('sends users with no groups to pending approval', () => {
    expect(getLandingRedirect([])).toBe(PENDING_APPROVAL_PATH);
  });

  it('sends users with only unknown groups to pending approval', () => {
    expect(getLandingRedirect(['something-else'])).toBe(PENDING_APPROVAL_PATH);
  });

  it('ignores unknown groups when a single known group is present', () => {
    expect(getLandingRedirect(['something-else', 'operator'])).toBe('/operator/dashboard');
  });

  it('returns null for multi-role users so the portal selector is shown', () => {
    expect(getLandingRedirect(['administrator', 'customer'])).toBeNull();
    expect(getLandingRedirect(['administrator', 'operator'])).toBeNull();
    expect(getLandingRedirect(['operator', 'customer'])).toBeNull();
    expect(getLandingRedirect(['administrator', 'operator', 'customer'])).toBeNull();
  });
});

describe('getCustomerRouteRedirect', () => {
  it('lets customers stay', () => {
    expect(getCustomerRouteRedirect(flags(['customer']))).toBeNull();
  });

  it('lets dual-role customers stay regardless of other groups', () => {
    expect(getCustomerRouteRedirect(flags(['operator', 'customer']))).toBeNull();
    expect(getCustomerRouteRedirect(flags(['administrator', 'customer']))).toBeNull();
    expect(getCustomerRouteRedirect(flags(['administrator', 'operator', 'customer']))).toBeNull();
  });

  it('sends operator-only users to the operator dashboard', () => {
    expect(getCustomerRouteRedirect(flags(['operator']))).toBe('/operator/dashboard');
  });

  it('sends administrator-only users to the admin portal', () => {
    expect(getCustomerRouteRedirect(flags(['administrator']))).toBe('/administrator');
  });

  it('prefers administrator over operator for non-customer dual-role users', () => {
    expect(getCustomerRouteRedirect(flags(['administrator', 'operator']))).toBe('/administrator');
  });

  it('sends users with no groups to pending approval', () => {
    expect(getCustomerRouteRedirect(flags([]))).toBe(PENDING_APPROVAL_PATH);
  });

  it('sends users with only unknown groups to pending approval', () => {
    expect(getCustomerRouteRedirect(flags(['something-else']))).toBe(PENDING_APPROVAL_PATH);
  });
});

describe('getOperatorRouteRedirect', () => {
  it('lets operators stay', () => {
    expect(getOperatorRouteRedirect(flags(['operator']))).toBeNull();
  });

  it('lets dual-role admin+operator users stay in operator mode', () => {
    expect(getOperatorRouteRedirect(flags(['administrator', 'operator']))).toBeNull();
    expect(getOperatorRouteRedirect(flags(['administrator', 'operator', 'customer']))).toBeNull();
  });

  it('sends admin-only users to the admin portal', () => {
    expect(getOperatorRouteRedirect(flags(['administrator']))).toBe('/administrator');
  });

  it('prefers admin portal over customer portal for admin+customer users', () => {
    expect(getOperatorRouteRedirect(flags(['administrator', 'customer']))).toBe('/administrator');
  });

  it('sends customer-only users to the customer dashboard', () => {
    expect(getOperatorRouteRedirect(flags(['customer']))).toBe('/customer/dashboard');
  });

  it('sends users with no groups to pending approval', () => {
    expect(getOperatorRouteRedirect(flags([]))).toBe(PENDING_APPROVAL_PATH);
  });

  it('sends users with only unknown groups to pending approval', () => {
    expect(getOperatorRouteRedirect(flags(['something-else']))).toBe(PENDING_APPROVAL_PATH);
  });
});

describe('getAdminRouteRedirect', () => {
  it('lets administrators stay', () => {
    expect(getAdminRouteRedirect(flags(['administrator']))).toBeNull();
    expect(getAdminRouteRedirect(flags(['administrator', 'operator', 'customer']))).toBeNull();
  });

  it('sends operators to the operator dashboard', () => {
    expect(getAdminRouteRedirect(flags(['operator']))).toBe('/operator/dashboard');
  });

  it('prefers operator dashboard over customer dashboard for operator+customer users', () => {
    expect(getAdminRouteRedirect(flags(['operator', 'customer']))).toBe('/operator/dashboard');
  });

  it('sends customers to the customer dashboard', () => {
    expect(getAdminRouteRedirect(flags(['customer']))).toBe('/customer/dashboard');
  });

  it('sends users with no groups to pending approval', () => {
    expect(getAdminRouteRedirect(flags([]))).toBe(PENDING_APPROVAL_PATH);
  });

  it('sends users with only unknown groups to pending approval', () => {
    expect(getAdminRouteRedirect(flags(['something-else']))).toBe(PENDING_APPROVAL_PATH);
  });
});

describe('returnPath', () => {
  it.each([
    '/operator/routes/detail?code=gsgjxw',
    '/operator/dashboard',
    '/administrator/invoices',
    '/customer/dashboard',
    '/operator',
  ])('keeps %s', (path) => {
    expect(returnPath(path)).toBe(path);
  });

  it.each([
    null,
    undefined,
    '',
    '/',
    'operator/dashboard',
    'https://evil.example/operator/dashboard',
    '//evil.example/operator',
    '/\\evil.example',
    '/operators',
    '/administrator-x',
    '/api/admin/users',
    '/pending-approval',
    '/operator/../api/x',
    '/operator/x\ny',
  ])('refuses %p', (path) => {
    expect(returnPath(path)).toBeNull();
  });
});

describe('loginPathFor', () => {
  it('sends a visitor to sign in with where they were going', () => {
    expect(loginPathFor('/operator/routes/detail?code=gsgjxw')).toBe(
      '/?next=%2Foperator%2Froutes%2Fdetail%3Fcode%3Dgsgjxw'
    );
  });

  it('sends them to plain sign in when the page is not one to come back to', () => {
    expect(loginPathFor('/')).toBe('/');
    expect(loginPathFor('/pending-approval')).toBe('/');
  });
});

describe('getLandingRedirect with a page to return to', () => {
  const next = '/operator/routes/detail?code=gsgjxw';

  it('returns an Operator to the page they were going to', () => {
    expect(getLandingRedirect(['operator'], next)).toBe(next);
  });

  it('returns a multi-role user there too, skipping the portal selector', () => {
    expect(getLandingRedirect(['administrator', 'operator'], next)).toBe(next);
  });

  it('ignores a page in a portal the user does not belong to', () => {
    expect(getLandingRedirect(['customer'], next)).toBe('/customer/dashboard');
    expect(getLandingRedirect(['administrator', 'customer'], next)).toBeNull();
  });

  it('ignores a page that is not a safe path', () => {
    expect(getLandingRedirect(['operator'], '//evil.example')).toBe('/operator/dashboard');
  });

  it('still sends a user with no portal role to pending approval', () => {
    expect(getLandingRedirect([], next)).toBe(PENDING_APPROVAL_PATH);
  });
});
