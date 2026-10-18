import '@testing-library/jest-dom';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { ScheduleDiffPanel } from '../new/ScheduleDiffPanel';

const stop = (address: string, number: string, street: string, suburb: string) => ({
  address,
  addressStreetNumber: number,
  addressStreet: street,
  addressSuburb: suburb,
});

const reading = (...rows: object[]) => ({ readAt: '2026-10-18T01:00:00.000Z', readBySub: 'sub', attachmentIndex: 0, rows, warnings: [] }) as any;

describe('ScheduleDiffPanel', () => {
  it('lists Adds, Drops, rows to check by hand and unit changes', () => {
    render(
      <ScheduleDiffPanel
        reading={reading(
          { address: '31 Hazel Road Riverbend', numberOfSigns: 5, agent: 'Alex', isAuction: true },
          { address: '5 Kent Street' },
          { address: '309/3 Birch Place, Hillview' },
          { address: '12 Alder Street, Hillview' }
        )}
        stops={[
          stop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview'),
          stop('308/3 Birch Place, Hillview', '3', 'Birch Place', 'Hillview'),
          stop('15 Grove Crescent, Hillview', '15', 'Grove Crescent', 'Hillview'),
        ]}
      />
    );

    expect(screen.getByText(/1 to add, 1 to drop, 1 to check, 1 unchanged\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add' })).toBeInTheDocument();
    expect(screen.getByText(/31 Hazel Road Riverbend · 5 signs · Alex/)).toBeInTheDocument();
    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Drop' })).toBeInTheDocument();
    expect(screen.getByText('15 Grove Crescent, Hillview')).toBeInTheDocument();
    expect(screen.getByText('No suburb given')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Same Property, different unit' })).toBeInTheDocument();
    expect(screen.getByText('now 309/3 Birch Place, Hillview')).toBeInTheDocument();
  });

  it('says nothing is applied, and leaves out headings with nothing under them', () => {
    render(
      <ScheduleDiffPanel reading={reading({ address: '12 Alder Street, Hillview' })} stops={[stop('12 Alder Street, Hillview', '12', 'Alder Street', 'Hillview')]} />
    );
    expect(screen.getByText(/0 to add, 0 to drop, 0 to check, 1 unchanged\. Nothing is applied/)).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
