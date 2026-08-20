export const PORTAL_PATHS = {
  administrator: '/administrator',
  operator: '/operator/dashboard',
  customer: '/customer/dashboard',
} as const;

export type PortalRole = keyof typeof PORTAL_PATHS;

export type PortalOption = {
  key: PortalRole;
  title: string;
  description: string;
  path: string;
};

const PORTAL_TITLES: Record<PortalRole, string> = {
  administrator: 'Administrator Portal',
  operator: 'Operator Portal',
  customer: 'Customer Portal',
};

const PORTAL_DESCRIPTIONS: Record<PortalRole, string> = {
  administrator: 'Manage customers, invoices, users, and routes from a desktop.',
  operator: 'Run routes in the field with maps and stop tracking, mobile-first.',
  customer: 'View your routes, deliveries, and invoices.',
};

export function buildPortalOptions(groups: string[]): PortalOption[] {
  const options: PortalOption[] = [];

  (Object.keys(PORTAL_PATHS) as PortalRole[]).forEach((role) => {
    if (groups.includes(role)) {
      options.push({
        key: role,
        title: PORTAL_TITLES[role],
        description: PORTAL_DESCRIPTIONS[role],
        path: PORTAL_PATHS[role],
      });
    }
  });

  return options;
}

export function resolvePortalPath(groups: string[], preferredOrder: PortalRole[]): string | null {
  for (const role of preferredOrder) {
    if (groups.includes(role)) {
      return PORTAL_PATHS[role];
    }
  }

  return null;
}