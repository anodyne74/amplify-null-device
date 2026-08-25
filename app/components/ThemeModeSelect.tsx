'use client';

import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { Switch } from '@/app/components/ui/forms/Switch';
import styles from './ThemeModeSelect.module.css';

interface ThemeModeSelectProps {
  className?: string;
  label?: string;
}

export default function ThemeModeSelect({ className, label = 'Theme' }: ThemeModeSelectProps) {
  const { resolvedMode, setMode } = useThemeMode();
  const modeName = resolvedMode === 'dark' ? 'Dark' : 'Light';

  return (
    <div className={`${styles.wrapper}${className ? ` ${className}` : ''}`}>
      <Switch
        checked={resolvedMode === 'dark'}
        onChange={(event) => setMode(event.target.checked ? 'dark' : 'light')}
        label={label ? `${label}: ${modeName}` : modeName}
      />
    </div>
  );
}
