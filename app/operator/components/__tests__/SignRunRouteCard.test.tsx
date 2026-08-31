import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignRunRouteCard } from '../SignRunRouteCard';
import { getSignRunPhase } from '@/lib/signRunPhase';
import type { Route } from '@/amplify/types';

function baseRoute(overrides: Partial<Route> = {}): Route {
  return {
    id: 'route-1234abcd',
    routeCode: 'W25-08-114',
    customerId: 'cust-1',
    status: 'in_progress',
    drivingModeEnabled: true,
    ...overrides,
  } as Route;
}

describe('SignRunRouteCard', () => {
  it('renders route code, customer, phase pill, stops/signs and CTA, linking to the Placement screen', () => {
    const route = baseRoute({ executionPhase: 'placement' });
    const phaseInfo = getSignRunPhase(route, 12)!;

    render(<SignRunRouteCard route={route} customerName="Beltline Group" phaseInfo={phaseInfo} stopCount={12} signsTotal={48} />);

    expect(screen.getByText('W25-08-114')).toBeInTheDocument();
    expect(screen.getByText('Beltline Group')).toBeInTheDocument();
    // "Placement" appears twice: the phase pill and (since the route is in
    // progress, not planned) the status label reusing the same phase name.
    expect(screen.getAllByText('Placement')).toHaveLength(2);
    expect(screen.getByText('12 stops')).toBeInTheDocument();
    expect(screen.getByText('48 signs')).toBeInTheDocument();
    expect(screen.getByText('Place signs →')).toBeInTheDocument();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/operator/routes/placement?id=route-1234abcd');
  });

  it('links a Load-phase route to the Load screen instead of routes/detail', () => {
    const route = baseRoute({ status: 'in_progress', executionPhase: 'load' });
    const phaseInfo = getSignRunPhase(route, 12)!;

    render(<SignRunRouteCard route={route} customerName="Beltline Group" phaseInfo={phaseInfo} stopCount={12} signsTotal={48} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/operator/routes/load?id=route-1234abcd');
  });

  it('links a Pickup-phase route to the Pickup screen instead of routes/detail', () => {
    const route = baseRoute({ status: 'in_progress', executionPhase: 'pickup' });
    const phaseInfo = getSignRunPhase(route, 12)!;

    render(<SignRunRouteCard route={route} customerName="Beltline Group" phaseInfo={phaseInfo} stopCount={12} signsTotal={48} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/operator/routes/pickup?id=route-1234abcd');
  });

  it('links an Unload-phase route to the Unload screen instead of routes/detail', () => {
    const route = baseRoute({ status: 'in_progress', executionPhase: 'unload' });
    const phaseInfo = getSignRunPhase(route, 12)!;

    render(<SignRunRouteCard route={route} customerName="Beltline Group" phaseInfo={phaseInfo} stopCount={12} signsTotal={48} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/operator/routes/unload?id=route-1234abcd');
  });

  it('links a Finalise-phase route to the Finalise screen instead of routes/detail', () => {
    const route = baseRoute({
      status: 'in_progress',
      executionPhase: 'unload',
      unloadConfirmedAt: '2026-08-31T10:00:00.000Z',
    });
    const phaseInfo = getSignRunPhase(route, 12)!;

    render(<SignRunRouteCard route={route} customerName="Beltline Group" phaseInfo={phaseInfo} stopCount={12} signsTotal={48} />);

    expect(screen.getByRole('link')).toHaveAttribute('href', '/operator/routes/finalise?id=route-1234abcd');
  });

  it('renders a locked route as a non-link card with the lock note and no CTA', () => {
    const route = baseRoute({ status: 'planned', executionPhase: null });
    const phaseInfo = getSignRunPhase(route, 0)!;

    render(<SignRunRouteCard route={route} customerName="Beltline Group" phaseInfo={phaseInfo} stopCount={0} signsTotal={0} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText(/not released yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it('shows a Notes badge and collapsible special instructions during placement/pickup', () => {
    const route = baseRoute({
      executionPhase: 'pickup',
      customerInstructions: JSON.stringify({
        v: 1,
        entries: [{ text: 'Auction boards first.', createdAt: '2026-08-30T00:00:00.000Z' }],
      }),
    });
    const phaseInfo = getSignRunPhase(route, 12)!;

    render(<SignRunRouteCard route={route} customerName="Beltline Group" phaseInfo={phaseInfo} stopCount={12} signsTotal={48} />);

    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.queryByText('Auction boards first.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /special instructions/i }));
    expect(screen.getByText('Auction boards first.')).toBeInTheDocument();
  });

  it('hides special instructions outside placement/pickup even when notes exist', () => {
    const route = baseRoute({
      executionPhase: 'load',
      customerInstructions: JSON.stringify({
        v: 1,
        entries: [{ text: 'Auction boards first.', createdAt: '2026-08-30T00:00:00.000Z' }],
      }),
    });
    const phaseInfo = getSignRunPhase(route, 12)!;

    render(<SignRunRouteCard route={route} customerName="Beltline Group" phaseInfo={phaseInfo} stopCount={12} signsTotal={48} />);

    expect(screen.queryByRole('button', { name: /special instructions/i })).not.toBeInTheDocument();
  });
});
