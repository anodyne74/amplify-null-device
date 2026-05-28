export type AnalyticsPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year';

interface RouteAnalyticsRecord {
  actualDurationMinutes?: number | null;
  signsPlacedDistanceKm?: number | null;
  signsPickedUpDistanceKm?: number | null;
  stops?: number | unknown[] | null;
  signsPlaced?: number | null;
  signsPickedUp?: number | null;
  status?: string | null;
  executionPhase?: string | null;
  actualEndTime?: string | null;
  actualStartTime?: string | null;
  createdAt?: string | null;
}

interface InvoiceAnalyticsRecord {
  totalAmount?: number | null;
  invoiceDate?: string | null;
  date?: string | null;
  createdAt?: string | null;
}

export interface AggregatedData {
  dateGroup: string;
  routesCompleted: number;
  totalDurationMinutes: number;
  totalDistanceKm: number;
  totalStops: number;
  totalSignsPlaced: number;
  totalSignsPickedUp: number;
  totalRevenue: number;
  statusCounts: Record<string, number>;
  phaseCounts: Record<string, number>;
}

export function aggregateRouteData(
  routes: RouteAnalyticsRecord[],
  invoices: InvoiceAnalyticsRecord[],
  period: AnalyticsPeriod
): AggregatedData[] {
  const groupedData: Record<string, AggregatedData> = {};

  routes.forEach((route) => {
    const routeDate = route.actualEndTime || route.actualStartTime || route.createdAt;
    if (!routeDate) return;

    const dateGroup = getDateGroup(routeDate, period);

    if (!groupedData[dateGroup]) {
      groupedData[dateGroup] = {
        dateGroup,
        routesCompleted: 0,
        totalDurationMinutes: 0,
        totalDistanceKm: 0,
        totalStops: 0,
        totalSignsPlaced: 0,
        totalSignsPickedUp: 0,
        totalRevenue: 0,
        statusCounts: {},
        phaseCounts: {},
      };
    }

    const group = groupedData[dateGroup];
    const stopCount =
      typeof route.stops === 'number'
        ? route.stops
        : Array.isArray(route.stops)
          ? route.stops.length
          : 0;

    group.routesCompleted += 1;
    group.totalDurationMinutes += route.actualDurationMinutes || 0;
    group.totalDistanceKm += (route.signsPlacedDistanceKm || 0) + (route.signsPickedUpDistanceKm || 0);
    group.totalStops += stopCount;
    group.totalSignsPlaced += route.signsPlaced || 0;
    group.totalSignsPickedUp += route.signsPickedUp || 0;

    const statusKey = route.status || 'unknown';
    const phaseKey = route.executionPhase || 'unknown';

    group.statusCounts[statusKey] = (group.statusCounts[statusKey] || 0) + 1;
    group.phaseCounts[phaseKey] = (group.phaseCounts[phaseKey] || 0) + 1;
  });

  invoices.forEach((invoice) => {
    const invoiceDate = invoice.invoiceDate || invoice.date || invoice.createdAt;
    if (!invoiceDate) return;

    const dateGroup = getDateGroup(invoiceDate, period);

    if (!groupedData[dateGroup]) {
      groupedData[dateGroup] = {
        dateGroup,
        routesCompleted: 0,
        totalDurationMinutes: 0,
        totalDistanceKm: 0,
        totalStops: 0,
        totalSignsPlaced: 0,
        totalSignsPickedUp: 0,
        totalRevenue: 0,
        statusCounts: {},
        phaseCounts: {},
      };
    }

    groupedData[dateGroup].totalRevenue += invoice.totalAmount || 0;
  });

  return Object.values(groupedData).sort((a, b) => a.dateGroup.localeCompare(b.dateGroup));
}

export function getDateGroup(date: string, period: AnalyticsPeriod): string {
  const d = new Date(date);

  if (period === 'day') {
    return d.toISOString().split('T')[0];
  }

  if (period === 'week') {
    const firstDayOfWeek = new Date(d.setDate(d.getDate() - d.getDay()));
    return firstDayOfWeek.toISOString().split('T')[0];
  }

  if (period === 'month') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  if (period === 'quarter') {
    const quarter = Math.floor(d.getMonth() / 3) + 1;
    return `${d.getFullYear()}-Q${quarter}`;
  }

  return String(d.getFullYear());
}

export function getPreviousDateGroup(date: Date, period: AnalyticsPeriod): string {
  const previous = new Date(date);

  if (period === 'day') {
    previous.setDate(previous.getDate() - 1);
  } else if (period === 'week') {
    previous.setDate(previous.getDate() - 7);
  } else if (period === 'month') {
    previous.setMonth(previous.getMonth() - 1);
  } else if (period === 'quarter') {
    previous.setMonth(previous.getMonth() - 3);
  } else {
    previous.setFullYear(previous.getFullYear() - 1);
  }

  return getDateGroup(previous.toISOString(), period);
}