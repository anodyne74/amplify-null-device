import React from 'react';
import { Icon } from './Icon';
import { getAgentBadgeInitials, getAgentBadgeTone } from '@/lib/customerDefaults';

export interface AgentBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Initials and colour are derived from it; it is also the accessible name. */
  agentName: string;
  /** sm: stop cards; md: customer Standing Orders. */
  size?: 'sm' | 'md';
  /** Shows the default-agent star and adds "(default agent)" to the name. */
  isDefault?: boolean;
}

/** The coloured agent-initials circle. The same agent gets the same initials and
 * colour on every screen, from getAgentBadgeInitials / getAgentBadgeTone. */
export function AgentBadge({ agentName, size = 'md', isDefault = false, className = '', style, ...rest }: AgentBadgeProps) {
  const label = isDefault ? `${agentName} (default agent)` : agentName;
  const tone = getAgentBadgeTone(agentName);

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`nd-agent-badge nd-agent-badge--${size} ${className}`}
      style={
        {
          '--nd-agent-badge-bg': tone.backgroundColor,
          '--nd-agent-badge-fg': tone.color,
          ...style,
        } as React.CSSProperties
      }
      {...rest}
    >
      <span aria-hidden="true">{getAgentBadgeInitials(agentName)}</span>
      {isDefault && (
        <span className="nd-agent-badge__star" data-testid="default-agent-star" aria-hidden="true">
          <Icon name="star" size={11} />
        </span>
      )}
    </span>
  );
}
