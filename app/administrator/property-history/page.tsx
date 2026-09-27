'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Badge, type BadgeProps } from '@/app/components/ui/core/Badge';
import { Field } from '@/app/components/ui/forms/Field';
import { Input } from '@/app/components/ui/forms/Input';
import { Select } from '@/app/components/ui/forms/Select';
import { listAllCustomers } from '@/lib/customers';
import { formatRouteDate } from '@/lib/routeListHelpers';
import {
  invoiceLabel,
  type PropertyGroup,
  type PropertyHistoryFilters,
  type PropertyHistoryResult,
  type VisitRow,
} from '@/lib/propertyHistory';
import { matchTypeaheadOptions, titleCase, type TypeaheadOption } from '@/lib/propertyHistoryTypeahead';
import { listRouteProperties, listTypeaheadOptions, searchPropertyHistory, type RouteProperty } from '@/lib/propertyHistorySearch';
import styles from './page.module.css';

const AGENT_DEBOUNCE_MS = 400;

const STATUS_PRESENTATION: Record<VisitRow['status'], { label: string; tone: BadgeProps['tone'] }> = {
  planned: { label: 'Planned', tone: 'warning' },
  in_progress: { label: 'In progress', tone: 'info' },
  signs_placed: { label: 'Signs placed', tone: 'info' },
  signs_picked_up: { label: 'Signs picked up', tone: 'info' },
  completed: { label: 'Completed', tone: 'success' },
  archived: { label: 'Archived', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'danger' },
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

function isEmpty(result: PropertyHistoryResult): boolean {
  switch (result.level) {
    case 'suburb':
      return result.streets.length === 0;
    case 'street':
      return result.properties.length === 0;
    case 'address':
      return !result.property;
  }
}

/**
 * Property History (#289): every Visit to a suburb, street or address across
 * all Customers, from the one search API (#288) the reports use too. Searches
 * run only from a typeahead suggestion, so each is an exact match.
 */
export default function AdministratorPropertyHistoryPage() {
  const [options, setOptions] = useState<TypeaheadOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<{ value: string; label: string }[]>([]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<TypeaheadOption | null>(null);
  const [inputs, setInputs] = useState<FilterInputs>({ dateFrom: '', dateTo: '', auction: 'any', customerId: '' });
  const [agentInput, setAgentInput] = useState('');
  const [agent, setAgent] = useState('');
  const [result, setResult] = useState<PropertyHistoryResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const latestSearch = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([listTypeaheadOptions(), listAllCustomers()]).then(([optionsResult, customersResult]) => {
      if (cancelled) return;
      setOptions(optionsResult.data);
      setOptionsError(optionsResult.error ?? null);
      setCustomers(
        (customersResult.data ?? [])
          .map((customer) => ({ value: customer.id, label: customer.name || customer.id }))
          .sort((a, b) => a.label.localeCompare(b.label))
      );
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

  function setInput(field: keyof FilterInputs, value: string) {
    setInputs((current) => ({ ...current, [field]: value }));
  }

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Property History" subtitle="Every Visit to a suburb, street or address, across all Customers" />

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
              <Field label="Customer" htmlFor="ph-customer">
                <Select
                  id="ph-customer"
                  options={[{ value: '', label: 'All Customers' }, ...customers]}
                  value={inputs.customerId}
                  onChange={(event) => setInput('customerId', event.target.value)}
                />
              </Field>
            </div>
          </div>
        </Card>

        {searchError && (
          <p className="nd-badge nd-badge--danger" role="alert">
            {searchError}
          </p>
        )}
        {!selected && <p className={styles.note}>Pick a suburb, street or address from the suggestions to see its history.</p>}
        {selected && searching && !result && <p className={styles.note}>Searching…</p>}
        {selected && result && (
          <PropertyHistoryResults title={selected.label} result={result} onChooseProperty={chooseProperty} />
        )}
      </div>
    </OperatorRoute>
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
}: {
  title: string;
  result: PropertyHistoryResult;
  onChooseProperty: (property: RouteProperty) => void;
}) {
  if (isEmpty(result)) {
    return (
      <Card>
        <p className={styles.emptyState}>No Visits match {title} with these filters.</p>
      </Card>
    );
  }

  const properties = (list: PropertyGroup[]) =>
    list.map((property) => <PropertySection key={property.propertyKey} property={property} onChooseProperty={onChooseProperty} />);

  return (
    <Card title={title}>
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

const COLUMNS = ['Date', 'Route', 'Agent', 'Auction', 'Signs Placed', 'Invoice(s)', 'Status', 'Customer', 'Operator', 'Missing Signs', 'Location', ''];

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

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {COLUMNS.map((column, index) => (
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
  const status = STATUS_PRESENTATION[row.status];
  const routeLabel = row.routeCode ?? 'this Route';
  return (
    <>
      <tr>
        <td>{row.date ? formatRouteDate(row.date) : '—'}</td>
        <td>
          <a href={`/administrator/routes/detail?id=${row.routeId}`}>{row.routeCode ?? row.routeId}</a>
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
                <a href={`/administrator/invoices#invoice-${invoice.id}`}>{invoice.invoiceNumber}</a>
              </span>
            ))
          )}
        </td>
        <td>
          <Badge tone={status.tone} size="sm">
            {status.label}
          </Badge>
        </td>
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
          <td colSpan={COLUMNS.length}>
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
