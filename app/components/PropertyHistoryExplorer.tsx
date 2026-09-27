'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Card } from '@/app/components/ui/core/Card';
import { Button } from '@/app/components/ui/core/Button';
import { Tabs } from '@/app/components/ui/navigation/Tabs';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { formatRouteDate } from '@/lib/routeListHelpers';
import {
  invoiceLabel,
  STAFF_VISIT_COLUMNS,
  VISIT_COLUMNS,
  VISIT_STATUS_LABELS,
  type PropertyGroup,
  type PropertyHistoryFilters,
  type PropertyHistoryResult,
  type VisitRow,
} from '@/lib/propertyHistory';
import { resultProperties, type PropertyHistoryReportSummary } from '@/lib/propertyHistoryReport';
import { matchTypeaheadOptions, titleCase, type TypeaheadOption } from '@/lib/propertyHistoryTypeahead';
import {
  deletePropertyHistoryReport,
  generatePropertyHistoryReport,
  listPropertyHistoryReports,
  listRouteProperties,
  listTypeaheadOptions,
  openPropertyHistoryReport,
  restorePropertyHistoryReport,
  searchPropertyHistory,
  type RouteProperty,
} from '@/lib/propertyHistorySearch';
import styles from './PropertyHistoryExplorer.module.css';

const AGENT_DEBOUNCE_MS = 400;

const STATUS_TONES: Record<VisitRow['status'], BadgeProps['tone']> = {
  planned: 'warning',
  in_progress: 'info',
  signs_placed: 'info',
  signs_picked_up: 'info',
  completed: 'success',
  archived: 'neutral',
  skipped: 'danger',
};

const AUCTION_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'yes', label: 'Auction only' },
  { value: 'no', label: 'Not auction' },
];

interface FilterInputs {
  dateFrom: string;
  dateTo: string;
  auction: string;
  customerId: string;
}

function toFilters(inputs: FilterInputs, agent: string): PropertyHistoryFilters {
  return {
    ...(inputs.dateFrom ? { dateFrom: inputs.dateFrom } : {}),
    ...(inputs.dateTo ? { dateTo: inputs.dateTo } : {}),
    ...(agent.trim() ? { agent: agent.trim() } : {}),
    ...(inputs.auction !== 'any' ? { auction: inputs.auction === 'yes' } : {}),
    ...(inputs.customerId ? { customerId: inputs.customerId } : {}),
  };
}

export interface PropertyHistoryExplorerProps {
  /** Adds the Customer filter and the Customer, Operator, Missing Signs and Location columns. */
  staff: boolean;
  /** The Customer filter's choices (staff only). */
  customers?: { value: string; label: string }[];
  routeHref: (routeId: string) => string;
  /** Omit to show invoice numbers without links. */
  invoiceHref?: (invoiceId: string) => string;
  /** Adds Export and the Reports tab -- for administrators and Account Owners only. */
  reports?: boolean;
}

type ExplorerLinks = Pick<PropertyHistoryExplorerProps, 'staff' | 'routeHref' | 'invoiceHref'>;

const ExplorerLinksContext = createContext<ExplorerLinks>({ staff: false, routeHref: () => '#' });

const TABS = [
  { id: 'search', label: 'Search' },
  { id: 'reports', label: 'Reports' },
];

/**
 * Opens a PDF in a new tab once its link arrives. The tab is opened straight
 * away, while the click still counts as the user's, so it isn't blocked as a
 * popup.
 */
async function openInNewTab(getUrl: () => Promise<string>) {
  const tab = window.open('', '_blank');
  try {
    const url = await getUrl();
    if (tab) {
      tab.opener = null;
      tab.location.href = url;
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch (error) {
    tab?.close();
    throw error;
  }
}

/**
 * Property History's search and results (#289, #290), shared by the admin
 * and customer screens, with Export and the Reports tab where `reports` is
 * set (#291). Every search and report goes through the Property History API,
 * which also enforces who sees what; `staff` and `reports` only decide what's
 * shown. Searches run only from a typeahead suggestion, so each is an exact
 * match.
 */
export default function PropertyHistoryExplorer({ staff, customers = [], routeHref, invoiceHref, reports = false }: PropertyHistoryExplorerProps) {
  const [tab, setTab] = useState('search');
  const showing = reports ? tab : 'search';
  // The search panel keeps its place whether or not `reports` is set (it can
  // arrive after the page loads), so the search isn't lost when it does.
  return (
    <>
      {reports && <Tabs items={TABS} value={tab} onChange={setTab} aria-label="Property History" />}
      {/* Hidden rather than unmounted, so the search is still there on the way back. */}
      <div hidden={showing !== 'search'} className={styles.searchPanel}>
        <PropertyHistorySearchPanel staff={staff} customers={customers} routeHref={routeHref} invoiceHref={invoiceHref} canExport={reports} />
      </div>
      {showing === 'reports' && <PropertyHistoryReports staff={staff} />}
    </>
  );
}

function PropertyHistorySearchPanel({
  staff,
  customers = [],
  routeHref,
  invoiceHref,
  canExport = false,
}: Omit<PropertyHistoryExplorerProps, 'reports'> & { canExport?: boolean }) {
  const [options, setOptions] = useState<TypeaheadOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TypeaheadOption | null>(null);
  const [inputs, setInputs] = useState<FilterInputs>({ dateFrom: '', dateTo: '', auction: 'any', customerId: '' });
  const [agentInput, setAgentInput] = useState('');
  const [agent, setAgent] = useState('');
  const [result, setResult] = useState<PropertyHistoryResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const latestSearch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void listTypeaheadOptions().then((optionsResult) => {
      if (cancelled) return;
      setOptions(optionsResult.data);
      setOptionsError(optionsResult.error ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setAgent(agentInput), AGENT_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [agentInput]);

  const filters = useMemo(() => toFilters(inputs, agent), [inputs, agent]);

  useEffect(() => {
    if (!selected) return;
    const searchId = ++latestSearch.current;
    setSearching(true);
    setSearchError(null);
    searchPropertyHistory(selected.search, filters)
      .then((found) => {
        if (searchId === latestSearch.current) setResult(found);
      })
      .catch((error: unknown) => {
        if (searchId !== latestSearch.current) return;
        setResult(null);
        setSearchError(error instanceof Error ? error.message : 'Property History search failed.');
      })
      .finally(() => {
        if (searchId === latestSearch.current) setSearching(false);
      });
  }, [selected, filters]);

  function choose(option: TypeaheadOption) {
    setSelected(option);
    setQuery(option.label);
  }

  function chooseProperty(property: RouteProperty) {
    choose({ key: `address:${property.propertyKey}`, label: property.address, search: { level: 'address', propertyKey: property.propertyKey } });
  }

  async function exportReport() {
    if (!selected) return;
    setExporting(true);
    setExportError(null);
    try {
      await openInNewTab(async () => (await generatePropertyHistoryReport(selected.search, filters)).url);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Could not generate the report.');
    } finally {
      setExporting(false);
    }
  }

  function setInput(field: keyof FilterInputs, value: string) {
    setInputs((current) => ({ ...current, [field]: value }));
  }

  const links = useMemo(() => ({ staff, routeHref, invoiceHref }), [staff, routeHref, invoiceHref]);

  return (
    <ExplorerLinksContext.Provider value={links}>
      <Card>
        <div className={styles.searchBody}>
          <PropertyTypeahead
            options={options}
            query={query}
            onQueryChange={(value) => setQuery(value)}
            onChoose={choose}
          />
          {optionsError && <p className={styles.note}>{optionsError}</p>}

          <div className={styles.filters}>
            <Field label="From" htmlFor="ph-from">
              <Input id="ph-from" type="date" value={inputs.dateFrom} onChange={(event) => setInput('dateFrom', event.target.value)} />
            </Field>
            <Field label="To" htmlFor="ph-to">
              <Input id="ph-to" type="date" value={inputs.dateTo} onChange={(event) => setInput('dateTo', event.target.value)} />
            </Field>
            <Field label="Agent" htmlFor="ph-agent">
              <Input id="ph-agent" value={agentInput} placeholder="Any agent" onChange={(event) => setAgentInput(event.target.value)} />
            </Field>
            <Field label="Auction" htmlFor="ph-auction">
              <Select id="ph-auction" options={AUCTION_OPTIONS} value={inputs.auction} onChange={(event) => setInput('auction', event.target.value)} />
            </Field>
            {staff && (
              <Field label="Customer" htmlFor="ph-customer">
                <Select
                  id="ph-customer"
                  options={[{ value: '', label: 'All Customers' }, ...customers]}
                  value={inputs.customerId}
                  onChange={(event) => setInput('customerId', event.target.value)}
                />
              </Field>
            )}
          </div>
        </div>
      </Card>

      {(searchError || exportError) && (
        <p className="nd-badge nd-badge--danger" role="alert">
          {searchError ?? exportError}
        </p>
      )}
      {!selected && <p className={styles.note}>Pick a suburb, street or address from the suggestions to see its history.</p>}
      {selected && searching && !result && <p className={styles.note}>Searching…</p>}
      {selected && result && (
        <PropertyHistoryResults
          title={selected.label}
          result={result}
          onChooseProperty={chooseProperty}
          action={
            canExport && (
              <Button variant="secondary" size="sm" iconLeft="download" loading={exporting} disabled={exporting || searching} onClick={() => void exportReport()}>
                Export PDF
              </Button>
            )
          }
        />
      )}
    </ExplorerLinksContext.Provider>
  );
}

function PropertyTypeahead({
  options,
  query,
  onQueryChange,
  onChoose,
}: {
  options: TypeaheadOption[];
  query: string;
  onQueryChange: (value: string) => void;
  onChoose: (option: TypeaheadOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => matchTypeaheadOptions(options, query), [options, query]);
  const expanded = open && matches.length > 0;

  function choose(option: TypeaheadOption) {
    onChoose(option);
    setOpen(false);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (!expanded) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + matches.length) % matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(matches[Math.min(active, matches.length - 1)]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={styles.typeahead}>
      <Input
        role="combobox"
        aria-label="Suburb, street or address"
        aria-expanded={expanded}
        aria-controls="ph-suggestions"
        aria-autocomplete="list"
        aria-activedescendant={expanded ? `ph-suggestion-${active}` : undefined}
        iconLeft="search"
        placeholder="Epping — or Cliff Rd — or 14 Cliff Rd, Epping"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {expanded && (
        <ul id="ph-suggestions" role="listbox" className={styles.suggestions}>
          {matches.map((option, index) => (
            <li
              key={option.key}
              id={`ph-suggestion-${index}`}
              role="option"
              aria-selected={index === active}
              className={styles.suggestion}
              // Keep focus in the input, so its blur doesn't close the list before the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
            >
              <span>{option.label}</span>
              <span className={styles.suggestionLevel}>{titleCase(option.search.level)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PropertyHistoryResults({
  title,
  result,
  onChooseProperty,
  action,
}: {
  title: string;
  result: PropertyHistoryResult;
  onChooseProperty: (property: RouteProperty) => void;
  action?: React.ReactNode;
}) {
  if (resultProperties(result).length === 0) {
    return (
      <Card title={action ? title : undefined} action={action}>
        <p className={styles.emptyState}>No Visits match {title} with these filters.</p>
      </Card>
    );
  }

  const properties = (list: PropertyGroup[]) =>
    list.map((property) => <PropertySection key={property.propertyKey} property={property} onChooseProperty={onChooseProperty} />);

  return (
    <Card title={title} action={action}>
      <div className={styles.groups}>
        {result.level === 'suburb' &&
          result.streets.map((street) => (
            <details key={street.street} open className={styles.streetGroup} aria-label={titleCase(street.street)}>
              <summary className={styles.groupSummary}>
                <span className={styles.groupTitle}>{titleCase(street.street)}</span>
                <span className={styles.note}>
                  {street.properties.length} {street.properties.length === 1 ? 'Property' : 'Properties'}
                </span>
              </summary>
              <div className={styles.groups}>{properties(street.properties)}</div>
            </details>
          ))}
        {result.level === 'street' && properties(result.properties)}
        {result.level === 'address' && result.property && properties([result.property])}
      </div>
    </Card>
  );
}

function PropertySection({ property, onChooseProperty }: { property: PropertyGroup; onChooseProperty: (property: RouteProperty) => void }) {
  return (
    <details open className={styles.propertyGroup} aria-label={property.address}>
      <summary className={styles.groupSummary}>
        <span className={styles.groupTitle}>{property.address}</span>
        <Badge tone={property.visitCount > 0 ? 'brand' : 'neutral'} size="sm">
          {property.visitCount} {property.visitCount === 1 ? 'Visit' : 'Visits'}
        </Badge>
      </summary>
      {property.visits.length > 0 && <VisitTable rows={property.visits} propertyKey={property.propertyKey} onChooseProperty={onChooseProperty} />}
      {property.scheduled.length > 0 && (
        <>
          <h4 className={styles.subheading}>Scheduled</h4>
          <VisitTable rows={property.scheduled} propertyKey={property.propertyKey} onChooseProperty={onChooseProperty} />
        </>
      )}
    </details>
  );
}

function useColumns(): string[] {
  const { staff } = useContext(ExplorerLinksContext);
  return [...VISIT_COLUMNS, ...(staff ? STAFF_VISIT_COLUMNS : []), ''];
}

function VisitTable({
  rows,
  propertyKey,
  onChooseProperty,
}: {
  rows: VisitRow[];
  propertyKey: string;
  onChooseProperty: (property: RouteProperty) => void;
}) {
  const [openRouteId, setOpenRouteId] = useState<string | null>(null);
  const columns = useColumns();

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={column || index} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <VisitTableRow
              key={row.stopId}
              row={row}
              propertyKey={propertyKey}
              showingRoute={openRouteId === row.stopId}
              onToggleRoute={() => setOpenRouteId((current) => (current === row.stopId ? null : row.stopId))}
              onChooseProperty={onChooseProperty}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VisitTableRow({
  row,
  propertyKey,
  showingRoute,
  onToggleRoute,
  onChooseProperty,
}: {
  row: VisitRow;
  propertyKey: string;
  showingRoute: boolean;
  onToggleRoute: () => void;
  onChooseProperty: (property: RouteProperty) => void;
}) {
  const { staff, routeHref, invoiceHref } = useContext(ExplorerLinksContext);
  const columns = useColumns();
  const routeLabel = row.routeCode ?? 'this Route';
  return (
    <>
      <tr>
        <td>{row.date ? formatRouteDate(row.date) : '—'}</td>
        <td>
          <a href={routeHref(row.routeId)}>{row.routeCode ?? row.routeId}</a>
        </td>
        <td>{row.agent || '—'}</td>
        <td>{row.auction ? 'Auction' : '—'}</td>
        <td>{row.signsPlaced}</td>
        <td>
          {row.invoices.length === 0 ? (
            <span className={styles.note}>{invoiceLabel(row.invoices)}</span>
          ) : (
            row.invoices.map((invoice, index) => (
              <span key={invoice.id}>
                {index > 0 && ', '}
                {invoiceHref ? <a href={invoiceHref(invoice.id)}>{invoice.invoiceNumber}</a> : invoice.invoiceNumber}
              </span>
            ))
          )}
        </td>
        <td>
          <Badge tone={STATUS_TONES[row.status]} size="sm">
            {VISIT_STATUS_LABELS[row.status]}
          </Badge>
        </td>
        {staff && (
          <>
            <td>{row.customerName ?? '—'}</td>
            <td>{row.operatorName ?? '—'}</td>
            <td>{row.missingSigns ? row.missingSigns : '—'}</td>
            <td>
              {row.locationPrecision ? (
                <Badge tone={row.locationPrecision === 'approximate' ? 'warning' : 'neutral'} size="sm">
                  {titleCase(row.locationPrecision)}
                </Badge>
              ) : (
                '—'
              )}
            </td>
          </>
        )}
        <td>
          <button
            type="button"
            className="nd-btn nd-btn--ghost nd-btn--sm"
            aria-expanded={showingRoute}
            aria-label={`Other Properties on ${routeLabel}`}
            onClick={onToggleRoute}
          >
            Other Properties
          </button>
        </td>
      </tr>
      {showingRoute && (
        <tr>
          <td colSpan={columns.length}>
            <RouteProperties routeId={row.routeId} routeLabel={routeLabel} excludeKey={propertyKey} onChoose={onChooseProperty} />
          </td>
        </tr>
      )}
    </>
  );
}

function RouteProperties({
  routeId,
  routeLabel,
  excludeKey,
  onChoose,
}: {
  routeId: string;
  routeLabel: string;
  excludeKey: string;
  onChoose: (property: RouteProperty) => void;
}) {
  const [properties, setProperties] = useState<RouteProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listRouteProperties(routeId)
      .then((found) => {
        if (!cancelled) setProperties(found.filter((property) => property.propertyKey !== excludeKey));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load the Route’s Stops.');
      });
    return () => {
      cancelled = true;
    };
  }, [routeId, excludeKey]);

  if (error) return <p className={styles.note}>{error}</p>;
  if (!properties) return <p className={styles.note}>Loading {routeLabel}…</p>;
  if (properties.length === 0) return <p className={styles.note}>{routeLabel} visits no other Properties.</p>;
  return (
    <div className={styles.routeProperties}>
      <span className={styles.note}>Also on {routeLabel}:</span>
      {properties.map((property) => (
        <button key={property.propertyKey} type="button" className="nd-btn nd-btn--secondary nd-btn--sm" onClick={() => onChoose(property)}>
          {property.address}
        </button>
      ))}
    </div>
  );
}

const GENERATED_AT = new Intl.DateTimeFormat('en-AU', {
  timeZone: 'Australia/Sydney',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const REPORT_STATES: Record<PropertyHistoryReportSummary['state'], { label: string; tone: BadgeProps['tone'] }> = {
  active: { label: 'Active', tone: 'success' },
  deleted: { label: 'Deleted', tone: 'warning' },
  purged: { label: 'Purged', tone: 'neutral' },
};

/**
 * The Reports tab (#291): the reports the signed-in user may see, newest
 * first. Under retention (#292) Account Owners can delete one; administrators
 * also see deleted and purged reports, and can restore a deleted one.
 */
function PropertyHistoryReports({ staff }: { staff: boolean }) {
  const [reports, setReports] = useState<PropertyHistoryReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listPropertyHistoryReports()
      .then((found) => {
        if (!cancelled) setReports(found);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load reports.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function open(report: PropertyHistoryReportSummary) {
    setError(null);
    try {
      await openInNewTab(() => openPropertyHistoryReport(report.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open the report.');
    }
  }

  async function change(report: PropertyHistoryReportSummary, action: 'delete' | 'restore') {
    setError(null);
    setBusy(report.id);
    try {
      if (action === 'delete') {
        await deletePropertyHistoryReport(report.id);
        setReports((current) => current?.filter((candidate) => candidate.id !== report.id) ?? null);
      } else {
        const restored = await restorePropertyHistoryReport(report.id);
        setReports((current) => current?.map((candidate) => (candidate.id === report.id ? restored : candidate)) ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Could not ${action} the report.`);
    } finally {
      setBusy(null);
      setConfirmingDelete(null);
    }
  }

  function actions(report: PropertyHistoryReportSummary) {
    if (confirmingDelete === report.id) {
      return (
        <div className={styles.reportActions}>
          <span className={styles.note}>Delete {report.referenceNumber}?</span>
          <button
            type="button"
            className="nd-btn nd-btn--danger nd-btn--sm"
            disabled={busy === report.id}
            onClick={() => void change(report, 'delete')}
          >
            Delete
          </button>
          <button type="button" className="nd-btn nd-btn--ghost nd-btn--sm" onClick={() => setConfirmingDelete(null)}>
            Cancel
          </button>
        </div>
      );
    }
    return (
      <div className={styles.reportActions}>
        {report.state !== 'purged' && (
          <button
            type="button"
            className="nd-btn nd-btn--ghost nd-btn--sm"
            aria-label={`Open ${report.referenceNumber}`}
            onClick={() => void open(report)}
          >
            Open
          </button>
        )}
        {!staff && (
          <button
            type="button"
            className="nd-btn nd-btn--ghost nd-btn--sm"
            aria-label={`Delete ${report.referenceNumber}`}
            onClick={() => setConfirmingDelete(report.id)}
          >
            Delete
          </button>
        )}
        {staff && report.state === 'deleted' && (
          <button
            type="button"
            className="nd-btn nd-btn--secondary nd-btn--sm"
            aria-label={`Restore ${report.referenceNumber}`}
            disabled={busy === report.id}
            onClick={() => void change(report, 'restore')}
          >
            Restore
          </button>
        )}
      </div>
    );
  }

  return (
    <Card title="Reports">
      {error && (
        <p className="nd-badge nd-badge--danger" role="alert">
          {error}
        </p>
      )}
      {!reports && !error && <p className={styles.note}>Loading reports…</p>}
      {reports && reports.length === 0 && <p className={styles.emptyState}>No reports yet. Export a search to create one.</p>}
      {reports && reports.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Generated</th>
                <th scope="col">By</th>
                {staff && <th scope="col">Customer</th>}
                {staff && <th scope="col">Shared with</th>}
                {staff && <th scope="col">State</th>}
                <th scope="col">Search</th>
                <th scope="col">Filters</th>
                <th scope="col">Properties</th>
                <th scope="col">Visits</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{report.referenceNumber}</td>
                  <td>{GENERATED_AT.format(new Date(report.generatedAt))}</td>
                  <td>{report.generatedByName || '—'}</td>
                  {staff && <td>{report.customerName ?? 'All customers'}</td>}
                  {staff && <td>{report.audience === 'customer' ? 'Account Owners' : 'Administrators'}</td>}
                  {staff && (
                    <td>
                      <Badge tone={REPORT_STATES[report.state].tone} size="sm">
                        {REPORT_STATES[report.state].label}
                      </Badge>
                    </td>
                  )}
                  <td>{report.searchLabel}</td>
                  <td>{report.filterLabels.join(' · ')}</td>
                  <td>{report.propertyCount}</td>
                  <td>{report.visitCount}</td>
                  <td>{actions(report)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
