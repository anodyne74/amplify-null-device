import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AssignOperatorDialog } from '../AssignOperatorDialog';
import { callApi } from '@/lib/apiClient';
import { assignOperator } from '@/lib/administratorRouteActions';
import type { Route } from '@/amplify/types';

jest.mock('@/lib/apiClient', () => ({ callApi: jest.fn() }));
jest.mock('@/lib/administratorRouteActions', () => ({ assignOperator: jest.fn() }));

const route = (id: string, code: string, overrides: Partial<Route> = {}) =>
  ({ id, routeCode: code, customerId: 'c1', status: 'planned', ...overrides }) as Route;

const open = route('r1', 'W19-26-001');
const taken = route('r2', 'W19-26-002', { assignedOperatorSub: 'sub-2', assignedOperatorName: 'Sam Roe' });
const finished = route('r3', 'W19-26-003', { status: 'completed' });

const operators = [
  { sub: 'sub-1', name: 'Pat Lee', email: 'pat@example.com' },
  { sub: 'sub-2', name: 'Sam Roe', email: 'sam@example.com' },
];

function setup(routes: Route[]) {
  const onDone = jest.fn();
  const onClose = jest.fn();
  render(<AssignOperatorDialog routes={routes} onDone={onDone} onClose={onClose} />);
  return { onDone, onClose };
}

async function choose(name: RegExp) {
  const select = await screen.findByLabelText('Operator');
  await waitFor(() => expect(select).not.toBeDisabled());
  fireEvent.change(select, { target: { value: operators.find((o) => name.test(o.name))!.sub } });
}

beforeEach(() => {
  jest.clearAllMocks();
  (callApi as jest.Mock).mockResolvedValue({ users: operators });
  (assignOperator as jest.Mock).mockResolvedValue({ ok: true });
});

describe('AssignOperatorDialog', () => {
  it('lists the Operators', async () => {
    setup([open]);
    expect(await screen.findByRole('option', { name: 'Pat Lee (pat@example.com)' })).toBeInTheDocument();
  });

  it('names the Routes whose Operator would be replaced, and the finished Routes it will skip', async () => {
    setup([open, taken, finished]);
    await choose(/Pat/);

    expect(screen.getByText(/replaces the current Operator on W19-26-002 \(Sam Roe\)/)).toBeInTheDocument();
    expect(screen.getByText(/because they are finished: W19-26-003/)).toBeInTheDocument();
  });

  it('assigns every eligible Route, skips the finished one, then clears the selection', async () => {
    const { onDone } = setup([open, taken, finished]);
    await choose(/Pat/);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(assignOperator).toHaveBeenCalledTimes(2);
    expect(assignOperator).toHaveBeenCalledWith(open, operators[0]);
    expect(assignOperator).toHaveBeenCalledWith(taken, operators[0]);
  });

  it('sends no message to the Operator', async () => {
    const { onDone } = setup([open]);
    await choose(/Pat/);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).not.toHaveBeenCalledWith('/api/admin/send-job-assigned-email', expect.anything());
    expect(screen.queryByText(/notif/i)).not.toBeInTheDocument();
  });

  it('reports a partial failure per Route and retries only the failed ones', async () => {
    (assignOperator as jest.Mock).mockImplementation(async (r: Route) =>
      r.id === 'r2' ? { ok: false, error: 'boom', saved: false } : { ok: true }
    );
    const { onDone } = setup([open, taken]);
    await choose(/Pat/);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    expect(await screen.findByText('Assigned 1 of 2; W19-26-002 failed.')).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();

    (assignOperator as jest.Mock).mockClear();
    (assignOperator as jest.Mock).mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(assignOperator).toHaveBeenCalledTimes(1);
    expect(assignOperator).toHaveBeenCalledWith(taken, operators[0]);
  });

  it('says so when a Route was assigned but its audit entry was not written', async () => {
    (assignOperator as jest.Mock).mockResolvedValue({ ok: false, error: 'x', saved: true });
    setup([open]);
    await choose(/Pat/);
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

    expect(await screen.findByText(/W19-26-001 was assigned, but the audit entry could not be written/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry failed' })).not.toBeInTheDocument();
  });

  it('cannot assign until an Operator is chosen, and says when Operators could not be loaded', async () => {
    (callApi as jest.Mock).mockRejectedValue(new Error('down'));
    setup([open]);

    expect(await screen.findByRole('option', { name: 'Operators could not be loaded' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Assign' })).toBeDisabled();
  });
});
