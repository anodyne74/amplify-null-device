import React, { useMemo } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { Badge } from '@/app/components/ui/core/Badge';
import { StatTile } from '@/app/components/ui/data/StatTile';
import styles from './MetricsVisualization.module.css';
import type { AggregatedData } from '@/lib/aggregateRouteData';
import { formatCurrency, formatPeriodDisplay } from '@/lib/dashboardAnalytics';
import PeriodSelector from './PeriodSelector';

export type MetricsPeriod = 'month' | 'quarter' | 'year';

const METRICS_PERIODS: readonly MetricsPeriod[] = ['month', 'quarter', 'year'];
const WINDOW_SIZE_BY_PERIOD: Record<MetricsPeriod, number> = {
  month: 12,
  quarter: 8,
  year: 5,
};

interface MetricsVisualizationProps {
  data: AggregatedData[];
  period: MetricsPeriod;
  onPeriodChange: (period: MetricsPeriod) => void;
  loading: boolean;
  canShowFinancials: boolean;
  scopeLabel: string;
}

interface ChartPoint {
  key: string;
  label: string;
  value: number;
  secondaryValue?: number;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    maximumFractionDigits: value >= 10 ? 0 : 1,
  }).format(value);
}

function chartWindow(data: AggregatedData[], period: MetricsPeriod): AggregatedData[] {
  return data.slice(-WINDOW_SIZE_BY_PERIOD[period]);
}

function getMaxValue(points: ChartPoint[], includeSecondary = false): number {
  const values = points.flatMap((point) => [
    point.value,
    includeSecondary ? point.secondaryValue ?? 0 : 0,
  ]);
  return Math.max(1, ...values);
}

function BarChart({
  title,
  points,
  className,
}: {
  title: string;
  points: ChartPoint[];
  className: string;
}) {
  const maxValue = getMaxValue(points);
  const width = 640;
  const height = 210;
  const chartTop = 18;
  const chartBottom = 168;
  const leftPadding = 34;
  const rightPadding = 20;
  const availableWidth = width - leftPadding - rightPadding;
  const slotWidth = availableWidth / Math.max(points.length, 1);
  const barWidth = Math.max(16, Math.min(34, slotWidth * 0.48));

  return (
    <svg
      className={styles.chartSvg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="none"
    >
      <title>{title}</title>
      <line className={styles.chartAxis} x1={leftPadding} y1={chartBottom} x2={width - rightPadding} y2={chartBottom} />
      {points.map((point, index) => {
        const barHeight = Math.max(3, ((point.value / maxValue) * (chartBottom - chartTop)));
        const x = leftPadding + index * slotWidth + (slotWidth - barWidth) / 2;
        const y = chartBottom - barHeight;

        return (
          <g key={point.key}>
            <rect
              className={className}
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              rx={4}
            />
            <text className={styles.chartLabel} x={x + barWidth / 2} y={190} textAnchor="middle">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ title, points }: { title: string; points: ChartPoint[] }) {
  const maxValue = getMaxValue(points);
  const width = 640;
  const height = 210;
  const chartTop = 18;
  const chartBottom = 168;
  const leftPadding = 34;
  const rightPadding = 20;
  const availableWidth = width - leftPadding - rightPadding;
  const xStep = points.length > 1 ? availableWidth / (points.length - 1) : 0;
  const coordinates = points.map((point, index) => {
    const x = points.length === 1 ? leftPadding + availableWidth / 2 : leftPadding + index * xStep;
    const y = chartBottom - (point.value / maxValue) * (chartBottom - chartTop);
    return { ...point, x, y };
  });
  const linePath = coordinates
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  return (
    <svg
      className={styles.chartSvg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="none"
    >
      <title>{title}</title>
      <line className={styles.chartAxis} x1={leftPadding} y1={chartBottom} x2={width - rightPadding} y2={chartBottom} />
      {linePath && <path className={styles.distanceLine} d={linePath} />}
      {coordinates.map((point) => (
        <g key={point.key}>
          <circle className={styles.distancePoint} cx={point.x} cy={point.y} r={4.5} />
          <text className={styles.chartLabel} x={point.x} y={190} textAnchor="middle">
            {point.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function GroupedBarChart({ title, points }: { title: string; points: ChartPoint[] }) {
  const maxValue = getMaxValue(points, true);
  const width = 640;
  const height = 210;
  const chartTop = 18;
  const chartBottom = 168;
  const leftPadding = 34;
  const rightPadding = 20;
  const availableWidth = width - leftPadding - rightPadding;
  const slotWidth = availableWidth / Math.max(points.length, 1);
  const barWidth = Math.max(8, Math.min(18, slotWidth * 0.24));

  return (
    <svg
      className={styles.chartSvg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="none"
    >
      <title>{title}</title>
      <line className={styles.chartAxis} x1={leftPadding} y1={chartBottom} x2={width - rightPadding} y2={chartBottom} />
      {points.map((point, index) => {
        const primaryHeight = Math.max(3, (point.value / maxValue) * (chartBottom - chartTop));
        const secondaryHeight = Math.max(3, ((point.secondaryValue ?? 0) / maxValue) * (chartBottom - chartTop));
        const centerX = leftPadding + index * slotWidth + slotWidth / 2;
        const primaryX = centerX - barWidth - 2;
        const secondaryX = centerX + 2;

        return (
          <g key={point.key}>
            <rect
              className={styles.signPlaced}
              x={primaryX}
              y={chartBottom - primaryHeight}
              width={barWidth}
              height={primaryHeight}
              rx={4}
            />
            <rect
              className={styles.signPickedUp}
              x={secondaryX}
              y={chartBottom - secondaryHeight}
              width={barWidth}
              height={secondaryHeight}
              rx={4}
            />
            <text className={styles.chartLabel} x={centerX} y={190} textAnchor="middle">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function MetricsVisualization({
  data,
  period,
  onPeriodChange,
  loading,
  canShowFinancials,
  scopeLabel,
}: MetricsVisualizationProps) {
  const visibleData = useMemo(() => chartWindow(data, period), [data, period]);
  const latest = visibleData[visibleData.length - 1];
  const latestLabel = latest ? formatPeriodDisplay(latest.dateGroup, period) : 'No period';

  const routesPoints = visibleData.map((item) => ({
    key: item.dateGroup,
    label: formatPeriodDisplay(item.dateGroup, period),
    value: item.routesCompleted,
  }));
  const revenuePoints = visibleData.map((item) => ({
    key: item.dateGroup,
    label: formatPeriodDisplay(item.dateGroup, period),
    value: item.totalRevenue,
  }));
  const distancePoints = visibleData.map((item) => ({
    key: item.dateGroup,
    label: formatPeriodDisplay(item.dateGroup, period),
    value: item.totalDistanceKm,
  }));
  const signsPoints = visibleData.map((item) => ({
    key: item.dateGroup,
    label: formatPeriodDisplay(item.dateGroup, period),
    value: item.totalSignsPlaced,
    secondaryValue: item.totalSignsPickedUp,
  }));

  const header = (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        <p className={styles.eyebrow}>Metrics</p>
        <h2 id="metrics-visualisation-heading">Performance Metrics</h2>
        <Badge tone="info">{scopeLabel}</Badge>
      </div>
      <PeriodSelector
        selectedPeriod={period}
        onChange={onPeriodChange}
        periods={METRICS_PERIODS}
        label="Metrics period"
      />
    </div>
  );

  if (loading) {
    return (
      <section className={styles.panel} aria-labelledby="metrics-visualisation-heading">
        {header}
        <p className={styles.emptyState}>Loading metrics...</p>
      </section>
    );
  }

  if (!latest) {
    return (
      <section className={styles.panel} aria-labelledby="metrics-visualisation-heading">
        {header}
        <p className={styles.emptyState}>No metrics available yet.</p>
      </section>
    );
  }

  const signsHandled = latest.totalSignsPlaced + latest.totalSignsPickedUp;
  const chartSubtitle = `Latest period ${latestLabel}`;

  return (
    <section className={styles.panel} aria-labelledby="metrics-visualisation-heading">
      {header}

      <div className={styles.headlineGrid}>
        <StatTile label="Routes Completed" value={latest.routesCompleted} caption={latestLabel} icon="route" />
        {canShowFinancials && (
          <StatTile label="Revenue" value={formatCurrency(latest.totalRevenue)} caption={latestLabel} icon="receipt" />
        )}
        <StatTile label="Distance" value={`${latest.totalDistanceKm.toFixed(1)} km`} caption={latestLabel} icon="map-pin" />
        <StatTile
          label="Signs Handled"
          value={formatCompactNumber(signsHandled)}
          caption={`${formatCompactNumber(latest.totalSignsPlaced)} placed / ${formatCompactNumber(latest.totalSignsPickedUp)} picked up`}
        />
      </div>

      <div className={styles.chartsGrid}>
        <Card title="Routes Completed" subtitle={chartSubtitle}>
          <BarChart title="Routes completed trend" points={routesPoints} className={styles.routesBar} />
        </Card>

        {canShowFinancials && (
          <Card title="Revenue" subtitle={chartSubtitle}>
            <BarChart title="Revenue trend" points={revenuePoints} className={styles.revenueBar} />
          </Card>
        )}

        <Card title="Distance" subtitle={chartSubtitle}>
          <LineChart title="Distance trend" points={distancePoints} />
        </Card>

        <Card title="Sign Activity" subtitle={chartSubtitle}>
          <GroupedBarChart title="Sign activity trend" points={signsPoints} />
          <div className={styles.legend} aria-hidden="true">
            <span className={styles.legendItem}>
              <span className={styles.legendSwatchPlaced} />
              Placed
            </span>
            <span className={styles.legendItem}>
              <span className={styles.legendSwatchPickedUp} />
              Picked up
            </span>
          </div>
        </Card>
      </div>
    </section>
  );
}
