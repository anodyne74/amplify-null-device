import RouteDetailContent from './_RouteDetailContent';

export default async function CustomerRouteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  return <RouteDetailContent params={resolvedParams} />;
}
