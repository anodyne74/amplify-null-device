import { notFound } from 'next/navigation';
import { DEVPREVIEW } from '@/lib/devFixtures';
import { PlacementPreview } from './PlacementPreview';

/**
 * Operator Placement against fixture Stops, for checking field layouts at phone widths in
 * light and dark with no sign-in and no backend. Local only: start the dev server with
 * NEXT_PUBLIC_DEVPREVIEW=1 and open /devpreview/placement. Anywhere else it is a 404.
 */
export default function DevPreviewPlacementPage() {
  if (!DEVPREVIEW) notFound();
  return <PlacementPreview />;
}
