import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import AdminFormField from '@/app/components/AdminFormField';

describe('AdminFormField', () => {
  it('renders label and children without hint', () => {
    render(
      <AdminFormField label="Email" htmlFor="email-input">
        <input id="email-input" />
      </AdminFormField>
    );

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByText('Required')).not.toBeInTheDocument();
  });

  it('renders hint with default class when no hintClassName is provided', () => {
    render(
      <AdminFormField label="Email" hint="Required">
        <input />
      </AdminFormField>
    );

    const hint = screen.getByText('Required');
    expect(hint).toBeInTheDocument();
    expect(hint).toHaveClass('fieldHint');
  });

  it('renders hint with provided className override', () => {
    render(
      <AdminFormField label="Email" hint="Custom hint" hintClassName="custom-hint">
        <input />
      </AdminFormField>
    );

    expect(screen.getByText('Custom hint')).toHaveClass('custom-hint');
  });
});
