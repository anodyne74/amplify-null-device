'use client';

import { useId } from 'react';
import { useThemeMode } from '@/app/components/AmplifyThemeProvider';
import { Select } from '@/app/components/ui/forms/Select';
import styles from './ThemeModeSelect.module.css';

interface ThemeModeSelectProps {
  className?: string;
  label?: string;
}

export default function ThemeModeSelect({ className, label = 'Theme' }: ThemeModeSelectProps) {
  const { mode, setMode } = useThemeMode();
  const id = useId();

  return (
    <div className={`${styles.wrapper}${className ? ` ${className}` : ''}`}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <Select
        id={id}
        size="sm"
        value={mode}
        onChange={(event) => {
          setMode(event.target.value as 'system' | 'light' | 'dark');
        }}
      >
        <option value="system">System</option>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </Select>
    </div>
  );
}
