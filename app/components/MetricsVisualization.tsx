import React, { useMemo } from 'react';
import styles from '@/app/dashboard.module.css';
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
      className={styles.metricsChartSvg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="none"
    >
      <title>{title}</title>
      <line className={styles.metricsChartAxis} x1={leftPadding} y1={chartBottom} x2={width - rightPadding} y2={chartBottom} />
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
            <text className={styles.metricsChartLabel} x={x + barWidth / 2} y={190} textAnchor="middle">
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
      className={styles.metricsChartSvg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="none"
    >
      <title>{title}</title>
      <line className={styles.metricsChartAxis} x1={leftPadding} y1={chartBottom} x2={width - rightPadding} y2={chartBottom} />
      {linePath && <path className={styles.metricsDistanceLine} d={linePath} />}
      {coordinates.map((point) => (
        <g key={point.key}>
          <circle className={styles.metricsDistancePoint} cx={point.x} cy={point.y} r={4.5} />
          <text className={styles.metricsChartLabel} x={point.x} y={190} textAnchor="middle">
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
      className={styles.metricsChartSvg}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={title}
      preserveAspectRatio="none"
    >
      <title>{title}</title>
      <line className={styles.metricsChartAxis} x1={leftPadding} y1={chartBottom} x2={width - rightPadding} y2={chartBottom} />
      {points.map((point, index) => {
        const primaryHeight = Math.max(3, (point.value / maxValue) * (chartBottom - chartTop));
        const secondaryHeight = Math.max(3, ((point.secondaryValue ?? 0) / maxValue) * (chartBottom - chartTop));
        const centerX = leftPadding + index * slotWidth + slotWidth / 2;
        const primaryX = centerX - barWidth - 2;
        const secondaryX = centerX + 2;

        return (
          <g key={point.key}>
            <rect
              className={styles.metricsSignPlaced}
              x={primaryX}
              y={chartBottom - primaryHeight}
              width={barWidth}
              height={primaryHeight}
              rx={4}
            />
            <rect
              className={styles.metricsSignPickedUp}
              x={secondaryX}
              y={chartBottom - secondaryHeight}
              width={barWidth}
              height={secondaryHeight}
              rx={4}
            />
            <text className={styles.metricsChartLabel} x={centerX} y={190} textAnchor="middle">
              {point.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <article className={styles.metricsChartCard}>
      <div className={styles.metricsChartHeader}>
        <h3 className={styles.metricsChartTitle}>{title}</h3>
        <p className={styles.metricsChartSubtitle}>{subtitle}</p>
      </div>
      {children}
    </article>
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

  if (loading) {
    return (
      <section className={styles.metricsPanel} aria-labelledby="metrics-visualisation-heading">
        <div className={styles.metricsHeader}>
          <div className={styles.metricsTitleGroup}>
            <p className={styles.metricsEyebrow}>Metrics</p>
            <h2 id="metrics-visualisation-heading">Performance Metrics</h2>
            <span className={styles.metricsScopePill}>{scopeLabel}</span>
          </div>
          <PeriodSelector
            selectedPeriod={period}
            onChange={onPeriodChange}
            periods={METRICS_PERIODS}
            label="Metrics period"
          />
        </div>
        <p className={styles.metricsEmptyState}>Loading metrics...</p>
      </section>
    );
  }

  if (!latest) {
    return (
      <section className={styles.metricsPanel} aria-labelledby="metrics-visualisation-heading">
        <div className={styles.metricsHeader}>
          <div className={styles.metricsTitleGroup}>
            <p className={styles.metricsEyebrow}>Metrics</p>
            <h2 id="metrics-visualisation-heading">Performance Metrics</h2>
            <span className={styles.metricsScopePill}>{scopeLabel}</span>
          </div>
          <PeriodSelector
            selectedPeriod={period}
            onChange={onPeriodChange}
            periods={METRICS_PERIODS}
            label="Metrics period"
          />
        </div>
        <p className={styles.metricsEmptyState}>No metrics available yet.</p>
      </section>
    );
  }

  const signsHandled = latest.totalSignsPlaced + latest.totalSignsPickedUp;
  const chartSubtitle = `Latest period ${latestLabel}`;

  return (
    <section className={styles.metricsPanel} aria-labelledby="metrics-visualisation-heading">
      <div className={styles.metricsHeader}>
        <div className={styles.metricsTitleGroup}>
          <p className={styles.metricsEyebrow}>Metrics</p>
          <h2 id="metrics-visualisation-heading">Performance Metrics</h2>
          <span className={styles.metricsScopePill}>{scopeLabel}</span>
        </div>
        <PeriodSelector
          selectedPeriod={period}
          onChange={onPeriodChange}
          periods={METRICS_PERIODS}
          label="Metrics period"
        />
      </div>

      <div className={styles.metricsHeadlineGrid}>
        <article className={styles.metricsHeadlineCard}>
          <p className={styles.metricsHeadlineLabel}>Routes Completed</p>
          <p className={styles.metricsHeadlineValue}>{latest.routesCompleted}</p>
          <p className={styles.metricsHeadlineMeta}>{latestLabel}</p>
        </article>
        {canShowFinancials && (
          <article className={styles.metricsHeadlineCard}>
            <p className={styles.metricsHeadlineLabel}>Revenue</p>
            <p className={styles.metricsHeadlineValue}>{formatCurrency(latest.totalRevenue)}</p>
            <p className={styles.metricsHeadlineMeta}>{latestLabel}</p>
          </article>
        )}
        <article className={styles.metricsHeadlineCard}>
          <p className={styles.metricsHeadlineLabel}>Distance</p>
          <p className={styles.metricsHeadlineValue}>{latest.totalDistanceKm.toFixed(1)} km</p>
          <p className={styles.metricsHeadlineMeta}>{latestLabel}</p>
        </article>
        <article className={styles.metricsHeadlineCard}>
          <p className={styles.metricsHeadlineLabel}>Signs Handled</p>
          <p className={styles.metricsHeadlineValue}>{formatCompactNumber(signsHandled)}</p>
          <p className={styles.metricsHeadlineMeta}>
            {formatCompactNumber(latest.totalSignsPlaced)} placed / {formatCompactNumber(latest.totalSignsPickedUp)} picked up
          </p>
        </article>
      </div>

      <div className={styles.metricsChartsGrid}>
        <ChartCard title="Routes Completed" subtitle={chartSubtitle}>
          <BarChart title="Routes completed trend" points={routesPoints} className={styles.metricsRoutesBar} />
        </ChartCard>

        {canShowFinancials && (
          <ChartCard title="Revenue" subtitle={chartSubtitle}>
            <BarChart title="Revenue trend" points={revenuePoints} className={styles.metricsRevenueBar} />
          </ChartCard>
        )}

        <ChartCard title="Distance" subtitle={chartSubtitle}>
          <LineChart title="Distance trend" points={distancePoints} />
        </ChartCard>

        <ChartCard title="Sign Activity" subtitle={chartSubtitle}>
          <GroupedBarChart title="Sign activity trend" points={signsPoints} />
          <div className={styles.metricsLegend} aria-hidden="true">
            <span className={styles.metricsLegendItem}>
              <span className={styles.metricsLegendSwatchPlaced} />
              Placed
            </span>
            <span className={styles.metricsLegendItem}>
              <span className={styles.metricsLegendSwatchPickedUp} />
              Picked up
            </span>
          </div>
        </ChartCard>
      </div>
    </section>
  );
}
