import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import RouteFeedbackCard from '../RouteFeedbackCard';
import { ApiError, callApi } from '@/lib/apiClient';

jest.mock('@/lib/apiClient', () => ({
  ...jest.requireActual('@/lib/apiClient'),
  callApi: jest.fn(),
}));

const mockCallApi = callApi as jest.Mock;

function answer({ locked = null as string | null, send = { success: true, emailed: false } as unknown } = {}) {
  mockCallApi.mockImplementation(async (path: string) => {
    if (path === '/api/customer/route-feedback/status') return { locked };
    if (path === '/api/customer/route-feedback') {
      if (send instanceof Error) throw send;
      return send;
    }
    throw new Error(`unexpected ${path}`);
  });
}

// The buttons wait for the server to say the Route is still open for feedback.
async function readyButton(name: string) {
  const button = await screen.findByRole('button', { name });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}

describe('RouteFeedbackCard (#467)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    answer();
  });

  it('saves All good in one click and thanks the customer', async () => {
    const onSaved = jest.fn();
    render(<RouteFeedbackCard routeId="route-1" onSaved={onSaved} />);

    fireEvent.click(await readyButton('All good'));

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/customer/route-feedback', { routeId: 'route-1', tone: 'good', note: '' })
    );
    expect(await screen.findByText('Thanks — your feedback was sent.')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith({ tone: 'good', note: '' });
    expect(screen.getByText('You said: All good')).toBeInTheDocument();
  });

  it('asks what was off, and only sends once there is a note', async () => {
    render(<RouteFeedbackCard routeId="route-1" onSaved={jest.fn()} />);

    fireEvent.click(await readyButton('Something was off'));
    const send = screen.getByRole('button', { name: 'Send feedback' });
    expect(send).toBeDisabled();
    expect(mockCallApi).not.toHaveBeenCalledWith('/api/customer/route-feedback', expect.anything());

    fireEvent.change(screen.getByLabelText('What was off?'), { target: { value: '  Two signs faced the wrong way.  ' } });
    fireEvent.click(send);

    await waitFor(() =>
      expect(mockCallApi).toHaveBeenCalledWith('/api/customer/route-feedback', {
        routeId: 'route-1',
        tone: 'issue',
        note: 'Two signs faced the wrong way.',
      })
    );
    expect(await screen.findByText('You said: Something was off — “Two signs faced the wrong way.”')).toBeInTheDocument();
  });

  it('shows earlier feedback and lets the customer change it', async () => {
    render(<RouteFeedbackCard routeId="route-1" feedback={{ tone: 'good', note: '' }} onSaved={jest.fn()} />);

    expect(await screen.findByText('You said: All good')).toBeInTheDocument();
    await readyButton('Something was off');
  });

  it('shows feedback read-only once the route is invoiced', async () => {
    answer({ locked: 'This route has been invoiced, so its feedback can no longer be changed.' });
    render(<RouteFeedbackCard routeId="route-1" feedback={{ tone: 'issue', note: 'Missing sign' }} onSaved={jest.fn()} />);

    expect(await screen.findByText('This route has been invoiced, so its feedback can no longer be changed.')).toBeInTheDocument();
    expect(screen.getByText('You said: Something was off — “Missing sign”')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All good' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Something was off' })).not.toBeInTheDocument();
  });

  it('shows nothing once the route is invoiced if no feedback was given', async () => {
    answer({ locked: 'This route has been invoiced, so its feedback can no longer be changed.' });
    const { container } = render(<RouteFeedbackCard routeId="route-1" onSaved={jest.fn()} />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it('says so when the feedback could not be sent, and changes nothing', async () => {
    answer({ send: new ApiError('This route has been invoiced, so its feedback can no longer be changed.', 409) });
    const onSaved = jest.fn();
    render(<RouteFeedbackCard routeId="route-1" onSaved={onSaved} />);

    fireEvent.click(await readyButton('All good'));

    expect(await screen.findByText('This route has been invoiced, so its feedback can no longer be changed.')).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });
});
