import { useState } from 'react';
import { Button } from '@/app/components/ui/core/Button';
import { Icon } from '@/app/components/ui/core/Icon';
import { Input } from '@/app/components/ui/forms/Input';
import { Tag } from '@/app/components/ui/core/Tag';
import styles from '../page.module.css';

interface AgentOptionsEditorProps {
  agentOptions: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  onSetDefault: (value: string) => void;
  disabled?: boolean;
}

/** The "agent card" — an add/remove/click-to-default list of agent initials for a
 * customer. Shared by the Create Customer form and the Edit Customer panel so both
 * present the same UI. These codes are what show up on the operator's run sheet
 * when generating routes for this customer, so only initials are needed — not full
 * agent names. The first agent in the list is the customer's default agent
 * (pre-selected on new stops) — click a tag to make it the default. */
export default function AgentOptionsEditor({
  agentOptions,
  onAdd,
  onRemove,
  onSetDefault,
  disabled,
}: AgentOptionsEditorProps) {
  const [newAgentOption, setNewAgentOption] = useState('');

  const addAgent = () => {
    if (!newAgentOption.trim()) return;
    onAdd(newAgentOption);
    setNewAgentOption('');
  };

  return (
    <div className={styles.fieldsGridFull}>
      <p className={styles.mutedText}>
        Agents on this account — shown as codes on the operator&apos;s run sheet. Click an agent to make it the
        default for new stops.
      </p>
      {agentOptions.length > 0 && (
        <div className={styles.agentChipRow}>
          {agentOptions.map((option, index) => {
            const isDefault = index === 0;
            return (
              <Tag
                key={option}
                selected={isDefault}
                onClick={disabled || isDefault ? undefined : () => onSetDefault(option)}
                onRemove={disabled ? undefined : () => onRemove(option)}
                aria-label={isDefault ? `${option} (default agent)` : `Set ${option} as default agent`}
              >
                {isDefault && <Icon name="star" size={13} />}
                {option}
              </Tag>
            );
          })}
        </div>
      )}
      <div className={styles.agentChipAddRow}>
        <Input
          className={styles.agentChipAddInput}
          value={newAgentOption}
          onChange={(event) => setNewAgentOption(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              addAgent();
            }
          }}
          placeholder="Agent initials (e.g., BO)"
          maxLength={4}
          disabled={disabled}
          aria-label="Add agent"
        />
        <Button type="button" variant="ghost" size="sm" disabled={disabled || !newAgentOption.trim()} onClick={addAgent}>
          Add agent
        </Button>
      </div>
    </div>
  );
}
