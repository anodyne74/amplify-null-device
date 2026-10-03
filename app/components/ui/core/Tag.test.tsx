import '@testing-library/jest-dom';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { Tag } from './Tag';

describe('Tag', () => {
  it('is a focusable toggle button that reports whether it is selected, when clickable', () => {
    render(
      <>
        <Tag selected onClick={jest.fn()}>
          All
        </Tag>
        <Tag onClick={jest.fn()}>Planned</Tag>
      </>
    );

    const all = screen.getByRole('button', { name: 'All' });
    const planned = screen.getByRole('button', { name: 'Planned' });
    expect(all).toHaveAttribute('aria-pressed', 'true');
    expect(planned).toHaveAttribute('aria-pressed', 'false');
    expect(planned).toHaveAttribute('tabindex', '0');
  });

  it.each(['Enter', ' '])('is chosen with the %p key, without scrolling the page', (key) => {
    const onClick = jest.fn();
    render(<Tag onClick={onClick}>Planned</Tag>);

    const notPrevented = fireEvent.keyDown(screen.getByRole('button', { name: 'Planned' }), { key });

    expect(onClick).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it('ignores other keys', () => {
    const onClick = jest.fn();
    render(<Tag onClick={onClick}>Planned</Tag>);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Planned' }), { key: 'a' });

    expect(onClick).not.toHaveBeenCalled();
  });

  it('stays a plain label when it is not clickable', () => {
    render(<Tag selected>Auction</Tag>);

    const tag = screen.getByText('Auction');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(tag).not.toHaveAttribute('tabindex');
    expect(tag).not.toHaveAttribute('aria-pressed');
  });

  it('removes without choosing the tag, by mouse or keyboard', () => {
    const onClick = jest.fn();
    const onRemove = jest.fn();
    render(
      <Tag onClick={onClick} onRemove={onRemove}>
        Planned
      </Tag>
    );
    const remove = screen.getByRole('button', { name: 'Remove' });

    fireEvent.click(remove);
    fireEvent.keyDown(remove, { key: 'Enter' });

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
