import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScheduleReadingPanel } from '../new/ScheduleReadingPanel';
import { readSchedule } from '@/lib/routeRequests';

jest.mock('@/lib/routeRequests', () => ({
  ...jest.requireActual('@/lib/routeRequests'),
  readSchedule: jest.fn(),
}));

const PDF = { key: 'requests/e1/0-schedule.pdf', filename: 'schedule.pdf', contentType: 'application/pdf' };
const READING = {
  readAt: '2026-10-18T01:00:00.000Z',
  readBySub: 'sub-admin',
  attachmentIndex: 0,
  sheetDate: '10th October 2026',
  rows: [
    { address: '1 Example Street, Epping', numberOfSigns: 5, agent: 'Alex', timeSlot: '9:15 - 9:45', isNew: true },
    { address: '2/3 Sample Road, Eastwood', numberOfSigns: 1, isAuction: true },
  ],
  instructions: [{ text: 'Use the side street', address: '1 Example Street, Epping' }, { text: 'Call on arrival' }],
  warnings: ['Total unclear'],
};

const record = (overrides: object = {}) => ({ id: 'e1', attachments: [PDF], ...overrides }) as any;

describe('ScheduleReadingPanel', () => {
  beforeEach(() => jest.mocked(readSchedule).mockReset());

  it('offers to read a Route Request that has a Schedule, and lists what was read', async () => {
    jest.mocked(readSchedule).mockResolvedValue(READING as any);
    render(<ScheduleReadingPanel record={record()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Read Schedule' }));

    expect(await screen.findByText('1 Example Street, Epping')).toBeInTheDocument();
    expect(readSchedule).toHaveBeenCalledWith('e1', { force: false });
    expect(screen.getByText(/Sheet dated 10th October 2026\. 2 properties\./)).toBeInTheDocument();
    expect(screen.getByText('Total unclear')).toBeInTheDocument();
    expect(screen.getByText('2 instructions found:')).toBeInTheDocument();
    expect(screen.getByText('1 Example Street, Epping: Use the side street')).toBeInTheDocument();
    expect(screen.getByText('Auction')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Read again' })).toBeInTheDocument();
  });

  it('shows a stored reading straight away, without calling the server', () => {
    render(<ScheduleReadingPanel record={record({ scheduleReading: READING })} />);
    expect(screen.getByText('2/3 Sample Road, Eastwood')).toBeInTheDocument();
    expect(readSchedule).not.toHaveBeenCalled();
  });

  it('reads again on request', async () => {
    jest.mocked(readSchedule).mockResolvedValue(READING as any);
    render(<ScheduleReadingPanel record={record({ scheduleReading: READING })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read again' }));
    await waitFor(() => expect(readSchedule).toHaveBeenCalledWith('e1', { force: true }));
  });

  it("shows the server's reason when it cannot read the file", async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.mocked(readSchedule).mockRejectedValue(new Error('schedule.pdf has no text to read (it may be a scan). Enter the Stops by hand.'));
    render(<ScheduleReadingPanel record={record()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read Schedule' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('may be a scan');
  });

  it('says nothing when there is no Schedule to read', () => {
    const { container } = render(
      <ScheduleReadingPanel record={record({ attachments: [{ key: 'k', filename: 'logo.png', contentType: 'image/png', inline: true }] })} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
