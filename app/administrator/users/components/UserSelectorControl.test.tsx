import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import UserSelectorControl from '@/app/administrator/users/components/UserSelectorControl';

describe('UserSelectorControl', () => {
  it('renders email-load mode when listUsersDenied and trims email input', () => {
    const onEmailInputChange = jest.fn();
    const onLoadGroupsByEmail = jest.fn();

    render(
      <UserSelectorControl
        listUsersDenied
        selectedEmailInput=""
        selectedUsername=""
        users={[]}
        loading={false}
        pending={false}
        onEmailInputChange={onEmailInputChange}
        onLoadGroupsByEmail={onLoadGroupsByEmail}
        onSelectUsername={jest.fn()}
        onRefreshUsers={jest.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText('User email for loading groups'), {
      target: { value: '  user@example.com  ' },
    });
    expect(onEmailInputChange).toHaveBeenCalledWith('user@example.com');

    const loadButton = screen.getByRole('button', { name: 'Load Groups' });
    expect(loadButton).toHaveClass('adminBtnSecondary');
    expect(loadButton).toBeDisabled();
  });

  it('runs load-groups action when email is present', () => {
    const onLoadGroupsByEmail = jest.fn();

    render(
      <UserSelectorControl
        listUsersDenied
        selectedEmailInput="user@example.com"
        selectedUsername=""
        users={[]}
        loading={false}
        pending={false}
        onEmailInputChange={jest.fn()}
        onLoadGroupsByEmail={onLoadGroupsByEmail}
        onSelectUsername={jest.fn()}
        onRefreshUsers={jest.fn()}
      />
    );

    const loadButton = screen.getByRole('button', { name: 'Load Groups' });
    expect(loadButton).not.toBeDisabled();

    fireEvent.click(loadButton);
    expect(onLoadGroupsByEmail).toHaveBeenCalledTimes(1);
  });

  it('renders select/refresh mode and handles selection + refresh actions', () => {
    const onSelectUsername = jest.fn();
    const onRefreshUsers = jest.fn();

    render(
      <UserSelectorControl
        listUsersDenied={false}
        selectedEmailInput=""
        selectedUsername="alice"
        users={[
          { username: 'alice', name: 'Alice', email: 'alice@example.com', status: 'CONFIRMED' },
          { username: 'bob' },
        ]}
        loading={false}
        pending={false}
        onEmailInputChange={jest.fn()}
        onLoadGroupsByEmail={jest.fn()}
        onSelectUsername={onSelectUsername}
        onRefreshUsers={onRefreshUsers}
      />
    );

    expect(screen.getByRole('option', { name: 'Alice (alice@example.com) (CONFIRMED)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'bob' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Select user'), { target: { value: 'bob' } });
    expect(onSelectUsername).toHaveBeenCalledWith('bob');

    const refreshButton = screen.getByRole('button', { name: 'Refresh Users' });
    expect(refreshButton).toHaveClass('adminBtnGhost');
    fireEvent.click(refreshButton);
    expect(onRefreshUsers).toHaveBeenCalledTimes(1);
  });
});
