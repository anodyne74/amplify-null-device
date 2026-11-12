import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TextConsentPrompt } from '../TextConsentPrompt';
import { TextConsentSetting } from '../TextConsentSetting';

const operatorGet = jest.fn();
const consentGet = jest.fn();
const mockCallApi = jest.fn();

jest.mock('@/lib/data-client', () => ({
  getDataClient: () => ({
    models: { Operator: { get: operatorGet }, OperatorTextConsent: { get: consentGet } },
  }),
}));
jest.mock('@/lib/apiClient', () => ({ callApi: (...args: unknown[]) => mockCallApi(...args) }));
jest.mock('@/lib/use-user-groups', () => ({ useCurrentUserId: () => 'op-1' }));

const MOBILE = '+61412345678';

function given(phone: string | null, consent?: { textConsent: 'yes' | 'no'; textConsentMobile: string }) {
  operatorGet.mockResolvedValue({ data: { id: 'op-1', phone }, errors: undefined });
  consentGet.mockResolvedValue({ data: consent ? { id: 'op-1', ...consent } : null, errors: undefined });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockCallApi.mockResolvedValue({});
});

describe('TextConsentPrompt', () => {
  it('asks an Operator with a mobile who has not answered', async () => {
    given(MOBILE);
    render(<TextConsentPrompt userId="op-1" />);
    expect(await screen.findByText('May we text you about your Routes?')).toBeInTheDocument();
  });

  it.each(['yes', 'no'] as const)('does not ask an Operator who answered %s', async (answer) => {
    given(MOBILE, { textConsent: answer, textConsentMobile: MOBILE });
    render(<TextConsentPrompt userId="op-1" />);
    await waitFor(() => expect(consentGet).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not ask an Operator with no mobile', async () => {
    given(null);
    render(<TextConsentPrompt userId="op-1" />);
    await waitFor(() => expect(consentGet).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('does not ask when their answer could not be read', async () => {
    operatorGet.mockResolvedValue({ data: null, errors: [{ message: 'x' }] });
    consentGet.mockResolvedValue({ data: null, errors: undefined });
    render(<TextConsentPrompt userId="op-1" />);
    await waitFor(() => expect(operatorGet).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('records yes and goes away for good', async () => {
    given(MOBILE);
    render(<TextConsentPrompt userId="op-1" />);
    await screen.findByRole('dialog');
    consentGet.mockResolvedValue({ data: { id: 'op-1', textConsent: 'yes', textConsentMobile: MOBILE }, errors: undefined });
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockCallApi).toHaveBeenCalledWith('/api/operator/text-consent', { consent: 'yes' });
  });

  it.each([['No'], ['Close']])('records no when they press %s', async (name) => {
    given(MOBILE);
    render(<TextConsentPrompt userId="op-1" />);
    await screen.findByRole('dialog');
    consentGet.mockResolvedValue({ data: { id: 'op-1', textConsent: 'no', textConsentMobile: MOBILE }, errors: undefined });
    fireEvent.click(screen.getByRole('button', { name }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockCallApi).toHaveBeenCalledWith('/api/operator/text-consent', { consent: 'no' });
  });

  it('stays up with the error when the answer cannot be saved', async () => {
    given(MOBILE);
    mockCallApi.mockRejectedValue(new Error('Could not save'));
    render(<TextConsentPrompt userId="op-1" />);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});

describe('TextConsentSetting', () => {
  it('shows the current answer', async () => {
    given(MOBILE, { textConsent: 'yes', textConsentMobile: MOBILE });
    render(<TextConsentSetting />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
  });

  it('shows off while unanswered', async () => {
    given(MOBILE);
    render(<TextConsentSetting />);
    await screen.findByText(/haven.t answered yet/);
    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  it('records the new answer when switched', async () => {
    given(MOBILE, { textConsent: 'no', textConsentMobile: MOBILE });
    render(<TextConsentSetting />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    consentGet.mockResolvedValue({ data: { id: 'op-1', textConsent: 'yes', textConsentMobile: MOBILE }, errors: undefined });
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(mockCallApi).toHaveBeenCalledWith('/api/operator/text-consent', { consent: 'yes' }));
    await waitFor(() => expect(screen.getByRole('switch')).toBeChecked());
  });

  it('is off and disabled with a prompt to add a mobile when there is none', async () => {
    given(null);
    render(<TextConsentSetting />);
    expect(await screen.findByText(/Add an Australian mobile number/)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('shows the error when a change cannot be saved', async () => {
    given(MOBILE, { textConsent: 'no', textConsentMobile: MOBILE });
    mockCallApi.mockRejectedValue(new Error('Could not save'));
    render(<TextConsentSetting />);
    await waitFor(() => expect(screen.getByRole('switch')).toBeEnabled());
    fireEvent.click(screen.getByRole('switch'));
    expect(await screen.findByText('Could not save')).toBeInTheDocument();
    expect(screen.getByRole('switch')).not.toBeChecked();
  });
});
