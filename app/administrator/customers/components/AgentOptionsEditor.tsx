import { useState } from 'react';
import { Button } from '@/app/components/ui/core/Button';
import { Input } from '@/app/components/ui/forms/Input';
import { Tag } from '@/app/components/ui/core/Tag';
import styles from '../page.module.css';

interface AgentOptionsEditorProps {
  agentOptions: string[];
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  disabled?: boolean;
}

/** The "agent card" — an ordered add/remove/reorder list of agent initials for a
 * customer. Shared by the Create Customer form and the Edit Customer panel so both
 * present the same UI. These codes are what show up on the operator's run sheet
 * when generating routes for this customer, so only initials are needed — not full
 * agent names. The first agent in the list is the customer's default agent
 * (pre-selected on new stops) — reorder with Up/Down to change it. */
export default function AgentOptionsEditor({
  agentOptions,
  onAdd,
  onRemove,
  onMove,
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
        Agents on this account — shown as codes on the operator&apos;s run sheet. The first agent is the default
        for new stops; use Up/Down to reorder.
      </p>
      {agentOptions.length > 0 && (
        <ol className={styles.agentOrderedList}>
          {agentOptions.map((option, index) => (
            <li key={option} className={styles.agentOrderedRow}>
              {index === 0 && <span className={styles.agentDefaultBadge}>Default</span>}
              <Tag onRemove={disabled ? undefined : () => onRemove(option)}>{option}</Tag>
              <span className={styles.agentMoveGroup}>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onMove(index, 'up')}
                  disabled={disabled || index === 0}
                  aria-label={`Move ${option} earlier in the agent list`}
                >
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => onMove(index, 'down')}
                  disabled={disabled || index === agentOptions.length - 1}
                  aria-label={`Move ${option} later in the agent list`}
                >
                  Down
                </Button>
              </span>
            </li>
          ))}
        </ol>
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
