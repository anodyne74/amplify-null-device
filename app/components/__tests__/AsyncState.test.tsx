import { fireEvent, render, screen } from '@testing-library/react';
import AsyncState from '@/app/components/AsyncState';

describe('AsyncState', () => {
  it('shows the loading message while loading', () => {
    render(
      <AsyncState loading loadingMessage="Loading routes...">
        <p>content</p>
      </AsyncState>
    );
    expect(screen.getByText('Loading routes...')).toBeInTheDocument();
    expect(screen.queryByText('content')).not.toBeInTheDocument();
  });

  it('shows the error with a retry button', () => {
    const onRetry = jest.fn();
    render(
      <AsyncState loading={false} error="Failed to load routes." onRetry={onRetry}>
        <p>content</p>
      </AsyncState>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load routes.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry button without onRetry', () => {
    render(
      <AsyncState loading={false} error="Failed.">
        <p>content</p>
      </AsyncState>
    );
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });

  it('shows the empty state with an action', () => {
    render(
      <AsyncState
        loading={false}
        empty
        emptyMessage="No customers yet."
        emptyAction={<a href="/administrator/customers">Create one</a>}
      >
        <p>content</p>
      </AsyncState>
    );
    expect(screen.getByText('No customers yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create one' })).toBeInTheDocument();
  });

  it('renders children when loaded with data', () => {
    render(
      <AsyncState loading={false}>
        <p>content</p>
      </AsyncState>
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
