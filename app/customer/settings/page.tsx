'use client';

import UserSettingsPage from '@/app/components/UserSettingsPage';
import HelpLink from '@/app/customer/components/HelpLink';

export default function CustomerSettingsRoute() {
  return <UserSettingsPage title="User Settings" roleVariant="customer" headingAction={<HelpLink />} />;
}
