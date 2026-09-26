import { render, screen } from '@testing-library/react';
import { AgentBadge } from '@/app/components/ui/core/AgentBadge';
import { getAgentBadgeInitials, getAgentBadgeTone } from '@/lib/customerDefaults';

describe('AgentBadge', () => {
  it('shows the agent initials, hidden from assistive tech', () => {
    render(<AgentBadge agentName="Jamie Lee" />);

    const badge = screen.getByRole('img', { name: 'Jamie Lee' });
    expect(badge).toHaveTextContent(getAgentBadgeInitials('Jamie Lee'));
    expect(screen.getByText(getAgentBadgeInitials('Jamie Lee'))).toHaveAttribute('aria-hidden', 'true');
  });

  it('is named after the agent, with a matching tooltip', () => {
    render(<AgentBadge agentName="Pat Doe" />);

    expect(screen.getByRole('img', { name: 'Pat Doe' })).toHaveAttribute('title', 'Pat Doe');
  });

  it('takes its colour from getAgentBadgeTone through the badge CSS variables', () => {
    render(<AgentBadge agentName="Jamie Lee" />);

    const badge = screen.getByRole('img');
    const tone = getAgentBadgeTone('Jamie Lee');
    expect(badge.style.getPropertyValue('--nd-agent-badge-bg')).toBe(tone.backgroundColor);
    expect(badge.style.getPropertyValue('--nd-agent-badge-fg')).toBe(tone.color);
  });

  it('marks the default agent with a star and in its accessible name', () => {
    render(<AgentBadge agentName="Bob Owen" isDefault />);

    const badge = screen.getByRole('img', { name: 'Bob Owen (default agent)' });
    expect(badge).toHaveAttribute('title', 'Bob Owen (default agent)');
    expect(screen.getByTestId('default-agent-star')).toHaveAttribute('aria-hidden', 'true');
  });

  it('shows no star for other agents', () => {
    render(<AgentBadge agentName="Bob Owen" />);

    expect(screen.queryByTestId('default-agent-star')).not.toBeInTheDocument();
  });

  it('defaults to the medium size and accepts the small one', () => {
    const { rerender } = render(<AgentBadge agentName="Kim Park" />);
    expect(screen.getByRole('img')).toHaveClass('nd-agent-badge', 'nd-agent-badge--md');

    rerender(<AgentBadge agentName="Kim Park" size="sm" />);
    expect(screen.getByRole('img')).toHaveClass('nd-agent-badge--sm');
  });

  it('passes extra span attributes through', () => {
    render(<AgentBadge agentName="Kim Park" className="extra" data-testid="badge" />);

    expect(screen.getByTestId('badge')).toHaveClass('nd-agent-badge', 'extra');
  });
});
