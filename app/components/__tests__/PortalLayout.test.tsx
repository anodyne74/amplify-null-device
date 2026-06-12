import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { faGauge, faRoad } from '@fortawesome/free-solid-svg-icons';
import PortalLayout from '@/app/components/PortalLayout';

const usePathnameMock = jest.fn();

jest.mock('next/navigation', () => ({
  usePathname: () => usePathnameMock(),
}));

jest.mock('@/app/components/ThemeModeSelect', () => {
  return function MockThemeModeSelect({ label }: { label: string }) {
    return <label>{label}<select aria-label={label} /></label>;
  };
});

describe('PortalLayout navigation state', () => {
  it('only marks the exact home item active on child pages', () => {
    usePathnameMock.mockReturnValue('/administrator/routes');

    render(
      <PortalLayout
        variant="operator"
        portalTitle="Administrator Portal"
        navItems={[
          { href: '/administrator', label: 'Admin Home', icon: faGauge },
          { href: '/administrator/routes', label: 'Routes', icon: faRoad },
        ]}
        userEmail=""
        onLogout={jest.fn()}
        role="admin"
      >
        <div>Content</div>
      </PortalLayout>
    );

    expect(screen.getByRole('link', { name: /admin home/i })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: /routes/i })).toHaveAttribute('aria-current', 'page');
  });
});
