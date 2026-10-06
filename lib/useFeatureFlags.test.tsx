import { render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { callApi } from '@/lib/apiClient';
import { useCurrentUserId } from '@/lib/use-user-groups';
import type { FeatureFlagName } from '@/lib/featureFlags';
import { FeatureFlagsProvider, FeatureGate, RequireFeature, useFeatureFlags } from '@/lib/useFeatureFlags';

jest.mock('next/navigation', () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@/lib/apiClient', () => ({
  callApi: jest.fn(),
}));

jest.mock('@/lib/use-user-groups', () => ({
  useCurrentUserId: jest.fn(),
}));

// Test-only names: the registry ships empty (#297).
const ALPHA = 'alpha' as FeatureFlagName;
const BETA = 'beta' as FeatureFlagName;

const replaceMock = jest.fn();

function wrapper({ children }: { children: ReactNode }) {
  return <FeatureFlagsProvider>{children}</FeatureFlagsProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  (usePathname as jest.Mock).mockReturnValue('/customer/dashboard');
  (useRouter as jest.Mock).mockReturnValue({ replace: replaceMock });
  (useCurrentUserId as jest.Mock).mockReturnValue('user-1');
  (callApi as jest.Mock).mockResolvedValue({ flags: ['alpha'] });
});

describe('useFeatureFlags', () => {
  it('reads every flag as off while loading, then the flags the endpoint returns', async () => {
    const { result } = renderHook(() => useFeatureFlags(), { wrapper });

    expect(result.current.loading).toBe(true);
    expect(result.current.isOn(ALPHA)).toBe(false);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOn(ALPHA)).toBe(true);
    expect(result.current.isOn(BETA)).toBe(false);
    expect(callApi).toHaveBeenCalledWith('/api/customer/feature-flags', {});
  });

  it('reads every flag as off when the call fails', async () => {
    (callApi as jest.Mock).mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useFeatureFlags(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isOn(ALPHA)).toBe(false);
  });

  it('refetches on navigation, keeping the last answer meanwhile', async () => {
    const { result, rerender } = renderHook(() => useFeatureFlags(), { wrapper });
    await waitFor(() => expect(result.current.isOn(ALPHA)).toBe(true));

    let resolveNext: (value: unknown) => void = () => {};
    (callApi as jest.Mock).mockReturnValue(new Promise((resolve) => (resolveNext = resolve)));
    (usePathname as jest.Mock).mockReturnValue('/customer/routes');
    rerender();

    expect(callApi).toHaveBeenCalledTimes(2);
    expect(result.current.isOn(ALPHA)).toBe(true);

    resolveNext({ flags: [] });
    await waitFor(() => expect(result.current.isOn(ALPHA)).toBe(false));
  });

  it('does not call the endpoint before the user is known', () => {
    (useCurrentUserId as jest.Mock).mockReturnValue(undefined);
    const { result } = renderHook(() => useFeatureFlags(), { wrapper });
    expect(callApi).not.toHaveBeenCalled();
    expect(result.current.isOn(ALPHA)).toBe(false);
  });

  it('reads every flag as off outside the provider', () => {
    const { result } = renderHook(() => useFeatureFlags());
    expect(result.current.isOn(ALPHA)).toBe(false);
    expect(callApi).not.toHaveBeenCalled();
  });
});

describe('FeatureGate', () => {
  it('renders its content only when the flag is on', async () => {
    render(
      <FeatureFlagsProvider>
        <FeatureGate flag={ALPHA}>alpha content</FeatureGate>
        <FeatureGate flag={BETA}>beta content</FeatureGate>
      </FeatureFlagsProvider>
    );

    expect(screen.queryByText('alpha content')).not.toBeInTheDocument();
    expect(await screen.findByText('alpha content')).toBeInTheDocument();
    expect(screen.queryByText('beta content')).not.toBeInTheDocument();
  });
});

describe('RequireFeature', () => {
  it('renders the page when the flag is on', async () => {
    render(
      <FeatureFlagsProvider>
        <RequireFeature flag={ALPHA}>flagged page</RequireFeature>
      </FeatureFlagsProvider>
    );

    expect(await screen.findByText('flagged page')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('redirects to the dashboard, without rendering the page, when the flag is off', async () => {
    render(
      <FeatureFlagsProvider>
        <RequireFeature flag={BETA}>flagged page</RequireFeature>
      </FeatureFlagsProvider>
    );

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/customer/dashboard'));
    expect(screen.queryByText('flagged page')).not.toBeInTheDocument();
  });

  it('waits for the flags before deciding', () => {
    (callApi as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(
      <FeatureFlagsProvider>
        <RequireFeature flag={ALPHA}>flagged page</RequireFeature>
      </FeatureFlagsProvider>
    );

    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.queryByText('flagged page')).not.toBeInTheDocument();
  });
});
