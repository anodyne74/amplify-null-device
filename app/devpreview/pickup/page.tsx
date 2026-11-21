import { notFound } from 'next/navigation';
import { DEVPREVIEW } from '@/lib/devFixtures';
import { PickupPreview } from './PickupPreview';

/** Operator Pickup against fixture data. Local only; see app/devpreview/README.md. */
export default function DevPreviewPickupPage() {
  if (!DEVPREVIEW) notFound();
  return <PickupPreview />;
}
