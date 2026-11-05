import { notFound } from 'next/navigation';
import { DEVPREVIEW } from '@/lib/devFixtures';
import { UnloadPreview } from './UnloadPreview';

/** Operator Unload against fixture data. Local only; see app/devpreview/README.md. */
export default function DevPreviewUnloadPage() {
  if (!DEVPREVIEW) notFound();
  return <UnloadPreview />;
}
