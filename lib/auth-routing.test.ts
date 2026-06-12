import {
  getLandingRedirect,
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
