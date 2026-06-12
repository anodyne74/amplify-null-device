import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminRowMenu from '../AdminRowMenu';

function renderMenu() {
  return render(
    <div>
      <AdminRowMenu ariaLabel="More actions" label="Manage">
        <button type="button">First Action</button>
        <button type="button">Second Action</button>
        <button type="button">Third Action</button>
      </AdminRowMenu>
      <button type="button">Outside</button>
    </div>
  );
}

describe('AdminRowMenu', () => {
  it('opens on trigger click and moves focus to the first menu item', async () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'More actions' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'More actions' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'First Action' })).toHaveFocus();
    });
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.click(trigger);
    const firstItem = screen.getByRole('button', { name: 'First Action' });
    await waitFor(() => expect(firstItem).toHaveFocus());

    fireEvent.keyDown(firstItem, { key: 'Escape' });

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('cycles focus through menu items with ArrowDown and ArrowUp', async () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const first = screen.getByRole('button', { name: 'First Action' });
    const second = screen.getByRole('button', { name: 'Second Action' });
    const third = screen.getByRole('button', { name: 'Third Action' });
    await waitFor(() => expect(first).toHaveFocus());

    fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(third).toHaveFocus();

    // Wraps from last item back to the first.
    fireEvent.keyDown(third, { key: 'ArrowDown' });
    expect(first).toHaveFocus();

    // ArrowUp wraps backwards.
    fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(third).toHaveFocus();
  });

  it('opens via ArrowDown on the trigger', async () => {
    renderMenu();

    const trigger = screen.getByRole('button', { name: 'More actions' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    expect(screen.getByRole('menu', { name: 'More actions' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'First Action' })).toHaveFocus();
    });
  });

  it('closes when clicking outside the menu', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Outside' }));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('does not close when clicking inside the menu', () => {
    renderMenu();

    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Second Action' }));

    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
