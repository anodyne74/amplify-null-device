'use client';

import UserSettingsPage from '@/app/components/UserSettingsPage';
import { TextConsentSetting } from '@/app/operator/components/TextConsentSetting';

export default function OperatorSettingsRoute() {
  return <UserSettingsPage title="User Settings" roleVariant="operator" instantSettings={<TextConsentSetting />} />;
}
