import RouteDetailContent from './_RouteDetailContent';

export default function CustomerRouteDetailPage({ params }: { params: { id: string } }) {
  return <RouteDetailContent params={params} />;
}
