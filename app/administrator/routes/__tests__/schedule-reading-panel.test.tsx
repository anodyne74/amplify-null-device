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
    expect(readSchedule).toHaveBeenCalledWith('e1', { force: false, onProgress: expect.any(Function) });
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
    await waitFor(() => expect(readSchedule).toHaveBeenCalledWith('e1', { force: true, onProgress: expect.any(Function) }));
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

  it('puts a mismatch with the sheet’s totals among the warnings, before the model’s own', async () => {
    render(
      <ScheduleReadingPanel
        record={record({ scheduleReading: { ...READING, rows: [{ address: 'A', numberOfSigns: 5 }], statedTotals: { signs: 9 } } })}
      />
    );
    const items = screen.getAllByRole('listitem').map((item) => item.textContent);
    expect(items.findIndex((text) => /add up to 5 signs, but the sheet says 9/.test(text ?? ''))).toBeLessThan(items.indexOf('Total unclear'));
  });

  describe('a read left part way', () => {
    const PARTIAL = { ...READING, progress: { pagesRead: 1, pageCount: 2 } };

    it('carries on by itself once, rather than showing the rows so far as a reading', async () => {
      let finish: (reading: any) => void = () => {};
      jest.mocked(readSchedule).mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
      const onReading = jest.fn();

      const { rerender } = render(<ScheduleReadingPanel record={record({ scheduleReading: PARTIAL })} onReading={onReading} />);
      rerender(<ScheduleReadingPanel record={record({ scheduleReading: PARTIAL })} onReading={onReading} />);

      expect(screen.queryByText('1 Example Street, Epping')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Read 1 of 2 pages');
      expect(readSchedule).toHaveBeenCalledTimes(1);
      expect(readSchedule).toHaveBeenCalledWith('e1', { force: false, onProgress: expect.any(Function) });
      expect(onReading).not.toHaveBeenCalledWith(expect.objectContaining({ rows: expect.anything() }));

      finish(READING);
      expect(await screen.findByText('1 Example Street, Epping')).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('shows the error and can be run again when carrying on fails', async () => {
      jest.mocked(readSchedule).mockRejectedValueOnce(new Error('The model did not answer with valid JSON'));
      render(<ScheduleReadingPanel record={record({ scheduleReading: PARTIAL })} />);

      expect(await screen.findByRole('alert')).toHaveTextContent('The model did not answer with valid JSON');

      jest.mocked(readSchedule).mockResolvedValue(READING as any);
      fireEvent.click(screen.getByRole('button', { name: 'Read Schedule' }));
      expect(await screen.findByText('1 Example Street, Epping')).toBeInTheDocument();
    });
  });

  it('offers to read a Route Amendment that has no Schedule, and marks its adds and drops', async () => {
    jest.mocked(readSchedule).mockResolvedValue({
      ...READING,
      attachmentIndex: -1,
      rows: [
        { address: '3/13 Carlingford Road', change: 'add' },
        { address: '9 Other Street', change: 'drop' },
      ],
    } as any);
    render(<ScheduleReadingPanel record={record({ role: 'amendment', attachments: [] })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Read Amendment' }));

    expect(await screen.findByText('3/13 Carlingford Road')).toBeInTheDocument();
    expect(screen.getByText('Add')).toBeInTheDocument();
    expect(screen.getByText('Drop')).toBeInTheDocument();
    expect(screen.getByText(/check it against the email/)).toBeInTheDocument();
  });

  it('shows nothing for a Route Request that has no Schedule', () => {
    const { container } = render(<ScheduleReadingPanel record={record({ role: 'request', attachments: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });
});
