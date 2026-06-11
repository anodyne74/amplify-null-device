import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MetricsVisualization, { type MetricsPeriod } from '../MetricsVisualization';
import type { AggregatedData } from '@/lib/aggregateRouteData';

const analyticsRows: AggregatedData[] = [
  {
    dateGroup: '2025-12',
    routesCompleted: 2,
    totalDurationMinutes: 120,
    totalDistanceKm: 32.4,
    totalStops: 14,
    totalSignsPlaced: 18,
    totalSignsPickedUp: 16,
    totalRevenue: 1600,
    statusCounts: { completed: 2 },
    phaseCounts: { pickup: 2 },
  },
  {
    dateGroup: '2026-01',
    routesCompleted: 4,
    totalDurationMinutes: 210,
    totalDistanceKm: 57.2,
    totalStops: 28,
    totalSignsPlaced: 34,
    totalSignsPickedUp: 32,
    totalRevenue: 4200,
    statusCounts: { completed: 4 },
    phaseCounts: { pickup: 4 },
  },
];

describe('MetricsVisualization', () => {
  it('renders headline totals and dependency-free charts for financial users', () => {
    render(
      <MetricsVisualization
        data={analyticsRows}
        period="month"
        onPeriodChange={jest.fn()}
        loading={false}
        canShowFinancials
        scopeLabel="All customers"
      />
    );

    expect(screen.getByRole('heading', { name: /performance metrics/i })).toBeInTheDocument();
    expect(screen.getByText('All customers')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('$4,200.00')).toBeInTheDocument();
    expect(screen.getByText('57.2 km')).toBeInTheDocument();
    expect(screen.getByText('66')).toBeInTheDocument();

    expect(screen.getByRole('img', { name: /routes completed trend/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /revenue trend/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /distance trend/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /sign activity trend/i })).toBeInTheDocument();
  });

  it('limits period choices to month, quarter, and year', async () => {
    const user = userEvent.setup();
    const handlePeriodChange = jest.fn();

    render(
      <MetricsVisualization
        data={analyticsRows}
        period="month"
        onPeriodChange={handlePeriodChange}
        loading={false}
        canShowFinancials
        scopeLabel="All customers"
      />
    );

    const selector = screen.getByLabelText(/metrics period/i);
    const options = within(selector).getAllByRole('option').map((option) => option.textContent);

    expect(options).toEqual(['Month', 'Quarter', 'Year']);

    await user.selectOptions(selector, 'quarter');

    expect(handlePeriodChange).toHaveBeenCalledWith('quarter' satisfies MetricsPeriod);
  });

  it('hides revenue totals and charts for read-only customer users', () => {
    render(
      <MetricsVisualization
        data={analyticsRows}
        period="month"
        onPeriodChange={jest.fn()}
        loading={false}
        canShowFinancials={false}
        scopeLabel="Customer routes"
      />
    );

    expect(screen.getByText('Customer routes')).toBeInTheDocument();
    expect(screen.queryByText(/revenue/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /revenue trend/i })).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /routes completed trend/i })).toBeInTheDocument();
  });

  it('renders stable loading and empty states', () => {
    const { rerender } = render(
      <MetricsVisualization
        data={[]}
        period="year"
        onPeriodChange={jest.fn()}
        loading
        canShowFinancials={false}
        scopeLabel="Customer routes"
      />
    );

    expect(screen.getByText(/loading metrics/i)).toBeInTheDocument();

    rerender(
      <MetricsVisualization
        data={[]}
        period="year"
        onPeriodChange={jest.fn()}
        loading={false}
        canShowFinancials={false}
        scopeLabel="Customer routes"
      />
    );

    expect(screen.getByText(/no metrics available yet/i)).toBeInTheDocument();
  });
});
