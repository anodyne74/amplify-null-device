'use client';

import { useMemo } from 'react';
import type { RateLine, Route } from '@/amplify/types';
import { Card } from '@/app/components/ui/core/Card';
import { Badge } from '@/app/components/ui/core/Badge';
import { StatTile } from '@/app/components/ui/data/StatTile';
import { Switch } from '@/app/components/ui/forms/Switch';
import type { CustomerOption } from '@/app/administrator/invoices/types';
import { formatStopProperty, groupStopsByAgent, type StopSummary } from '@/app/administrator/invoices/stopFormatting';
import { computeDriverSplitPreview } from '@/app/administrator/invoices/driverSplitPreview';
import { getFinalizedRouteDistanceKm, getFinalizedRouteMinutes } from '@/app/administrator/invoices/routeInvoiceMetrics';
import { formatDuration } from '@/lib/signRunBilling';
import { signsPlaced } from '@/lib/signRunTotals';
import styles from './InvoicePreview.module.css';

interface InvoicePreviewProps {
  invoiceNumber: string;
  customer?: CustomerOption;
  route?: Route;
  rateLines: RateLine[];
  rateLineQuantities: Record<string, string>;
  totalHours: string;
  totalAmount: string;
  gstAmount: string;
  stops: StopSummary[];
  stopsLoading: boolean;
  billingCompanyName: string;
  billingAbn: string;
  billingPhone: string;
  billingCompanyAddress: string;
  billingPaymentAccountName: string;
  billingBsb: string;
  billingAccountNumber: string;
  onToggleGroupByAgent: (nextValue: boolean) => void;
}

interface PreviewLineRow {
  description: string;
  quantity: number;
  rate: number;
  total: number;
}

function buildPreviewLineRows({
  rateLines,
  rateLineQuantities,
  totalHours,
  customer,
  preGstAmount,
}: {
  rateLines: RateLine[];
  rateLineQuantities: Record<string, string>;
  totalHours: string;
  customer?: CustomerOption;
  preGstAmount: number;
}): PreviewLineRow[] {
  if (rateLines.length > 0) {
    return rateLines
      .map((line) => ({ line, quantity: Number(rateLineQuantities[line.id] ?? 0) }))
      .filter(({ quantity }) => Number.isFinite(quantity) && quantity > 0)
      .map(({ line, quantity }) => ({
        description: line.label,
        quantity,
        rate: line.ratePerUnit,
        total: Number((quantity * line.ratePerUnit).toFixed(2)),
      }));
  }

  const hours = Number(totalHours) || 0;
  const rate = customer?.billingRatePerHour ?? (hours > 0 ? Number((preGstAmount / hours).toFixed(2)) : preGstAmount);
  return [
    {
      description: 'General services',
      quantity: hours,
      rate,
      total: preGstAmount,
    },
  ];
}

export default function InvoicePreview({
  invoiceNumber,
  customer,
  route,
  rateLines,
  rateLineQuantities,
  totalHours,
  totalAmount,
  gstAmount,
  stops,
  stopsLoading,
  billingCompanyName,
  billingAbn,
  billingPhone,
  billingCompanyAddress,
  billingPaymentAccountName,
  billingBsb,
  billingAccountNumber,
  onToggleGroupByAgent,
}: InvoicePreviewProps) {
  const groupByAgent = Boolean(customer?.groupLineItemsByAgent);

  const total = Number(totalAmount) || 0;
  const gst = Number(gstAmount) || 0;
  const preGstAmount = Number((total - gst).toFixed(2));

  const lineRows = useMemo(
    () => buildPreviewLineRows({ rateLines, rateLineQuantities, totalHours, customer, preGstAmount }),
    [rateLines, rateLineQuantities, totalHours, customer, preGstAmount]
  );

  const subtotal = Number(lineRows.reduce((sum, row) => sum + row.total, 0).toFixed(2));

  const totalSigns = signsPlaced(stops);
  const agentGroups = useMemo(() => groupStopsByAgent(stops), [stops]);

  const driverSplit = computeDriverSplitPreview({
    billedAmount: preGstAmount,
    driverSplitPercent: customer?.driverSplitPercent,
  });

  const routeMinutes = getFinalizedRouteMinutes(route);
  const routeDistanceKm = getFinalizedRouteDistanceKm(route);
  const routeNotFinalized = Boolean(route) && route?.status !== 'completed';

  if (!customer) {
    return null;
  }

  return (
    <Card padded={false} className={styles.previewCard}>
      <div className={styles.letterhead}>
        <div>
          <div className={styles.companyName}>{billingCompanyName}</div>
          <div className={styles.companyDetail}>
            {billingAbn} · {billingPhone}
            <br />
            {billingCompanyAddress}
          </div>
        </div>
        <div className={styles.invoiceMeta}>
          <Badge tone="info">Draft</Badge>
          <div className={styles.invoiceNumber}>{invoiceNumber || '— pending —'}</div>
          <div className={styles.metaLine}>Issued {new Date().toISOString().slice(0, 10)}</div>
          <div className={styles.metaLine}>Terms 14 days · direct deposit</div>
        </div>
      </div>

      <div className={styles.threeColumns}>
        <div>
          <div className={styles.columnLabel}>Billed to</div>
          <div className={styles.columnHeading}>{customer.name}</div>
          <div className={styles.columnDetail}>{customer.addressLine1 || '—'}</div>
        </div>
        <div>
          <div className={styles.columnLabel}>For work completed</div>
          <div className={styles.columnHeading}>{route?.routeCode ?? (route ? route.id.slice(0, 8) : '— select a route —')}</div>
          <div className={styles.columnDetail}>
            {stopsLoading ? 'Loading stops…' : `${stops.length} stop${stops.length === 1 ? '' : 's'} · ${totalSigns} signs`}
          </div>
        </div>
        <div className={styles.payTo}>
          <div className={styles.columnLabel}>Pay to</div>
          <div className={styles.columnHeading}>{billingPaymentAccountName}</div>
          <div className={styles.columnDetail}>
            BSB {billingBsb} · Acct {billingAccountNumber}
            <br />
            Ref {invoiceNumber || '—'}
          </div>
        </div>
      </div>

      <table className={styles.lineTable}>
        <thead>
          <tr>
            <th>Description</th>
            <th className={styles.numeric}>Qty</th>
            <th className={styles.numeric}>Rate</th>
            <th className={styles.numeric}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lineRows.map((row, index) => (
            <tr key={index}>
              <td>{row.description}</td>
              <td className={styles.numeric}>{row.quantity.toFixed(2)}</td>
              <td className={styles.numeric}>${row.rate.toFixed(2)}</td>
              <td className={styles.numeric}>${row.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.totals}>
        <div className={styles.totalsRow}>
          <span>Subtotal (ex GST)</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        {gst > 0 && (
          <div className={styles.totalsRow}>
            <span>GST 10%</span>
            <span>${gst.toFixed(2)}</span>
          </div>
        )}
        <div className={`${styles.totalsRow} ${styles.totalsGrand}`}>
          <span>Total due</span>
          <span>${total.toFixed(2)}</span>
        </div>
      </div>

      <div className={styles.stopsSection}>
        <div className={styles.stopsSectionHeader}>
          <span className={styles.columnLabel}>Signs per stop</span>
          <span className={styles.metaLine}>{totalSigns} signs total</span>
        </div>

        {groupByAgent ? (
          <div className={styles.agentGroups}>
            {agentGroups.map((group) => (
              <div key={group.agent} className={styles.agentGroup}>
                <div className={styles.agentGroupHeader}>
                  <span>{group.agent}</span>
                  <span>{group.signCount} signs</span>
                </div>
                {group.stops.map((stop, index) => (
                  <div key={index} className={styles.stopRow}>
                    <span className={styles.stopAddress}>{formatStopProperty(stop)}</span>
                    <span className={styles.stopSigns}>{stop.numberOfSigns ?? '—'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.flatStops}>
            {stops.map((stop, index) => (
              <div key={index} className={styles.stopRow}>
                <span className={styles.stopAddress}>{formatStopProperty(stop)}</span>
                <span className={styles.stopAgent}>{stop.agent?.trim() || '—'}</span>
                <span className={styles.stopSigns}>{stop.numberOfSigns ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.internalPanel}>
        <div className={styles.columnLabel}>Internal · driver split (not shown to the customer)</div>
        {routeNotFinalized && (
          <div className={styles.metaLine}>Route not yet finalised — figures may change.</div>
        )}
        <div className={styles.statRow}>
          <StatTile label="Duration" value={formatDuration(routeMinutes)} />
          <StatTile label="Distance" value={`${routeDistanceKm.toFixed(1)} km`} />
          <StatTile
            label="Driver share"
            value={`$${driverSplit.driverShare.toFixed(2)}`}
            caption={`${driverSplit.splitPercent}% of $${preGstAmount.toFixed(2)} billed`}
          />
          <StatTile label="We retain" value={`$${driverSplit.retained.toFixed(2)}`} caption="ex GST" />
        </div>
      </div>

      <div className={styles.sendingPanel}>
        <div className={styles.columnLabel}>Sending</div>
        <Switch
          label="Group signs by agent for on-charging"
          checked={groupByAgent}
          onChange={(event) => onToggleGroupByAgent(event.target.checked)}
        />
        <div className={styles.metaLine}>
          Updates this customer&apos;s Payment Details setting — every PDF or email generated for{' '}
          {customer.name}, past and future, will use this.
        </div>
        <Switch label="Attach run sheets for each route" defaultChecked />
        <Switch label="Show the Pay to account and payment reference on the invoice" defaultChecked />
      </div>
    </Card>
  );
}
