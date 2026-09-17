'use client';

import { Card } from '@/app/components/ui/core/Card';
import { Input } from '@/app/components/ui/forms/Input';
import { Tag } from '@/app/components/ui/core/Tag';
import { RouteStatusPill } from '@/app/administrator/components/RouteStatusPill';
import { formatRouteDate } from '@/lib/routeListHelpers';
import type { UsePropertySearchResult } from '@/lib/usePropertySearch';
import styles from './page.module.css';

interface PropertySearchCardProps {
  search: UsePropertySearchResult;
}

export function PropertySearchCard({ search }: PropertySearchCardProps) {
  const { query, setQuery, scope, setScope, scopes, matches, totalPropertiesCount, totalRoutesCount, focusedRouteId, toggleFocusRoute } =
    search;

  const trimmed = query.trim();
  const isIdle = trimmed.length < 2;
  const hasResults = matches.length > 0;
  const noResults = !isIdle && !hasResults;
  const matchedRouteCount = new Set(matches.flatMap((m) => m.routes.map((r) => r.routeId))).size;

  return (
    <Card
      title="Find a property"
      subtitle="Search a full address, a street or a suburb to see every route it sits on"
    >
      <div className={styles.propertySearchBody}>
        <div className={styles.propertySearchRow}>
          <div className={styles.propertySearchField}>
            <Input
              aria-label="Property address, street, or suburb"
              iconLeft="search"
              placeholder="14 Cliff Rd, Epping — or Ryedale Rd — or Eastwood"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className={styles.propertyScopeRow}>
            <span className={styles.propertyScopeLabel}>Match on</span>
            {scopes.map((s) => (
              <Tag key={s} selected={s === scope} onClick={() => setScope(s)}>
                {s}
              </Tag>
            ))}
          </div>
        </div>

        {isIdle && (
          <div className={styles.propertyNote}>
            <span>
              Type at least two characters. {totalPropertiesCount} properties across {totalRoutesCount} routes — try
              &ldquo;Cliff Rd&rdquo;, &ldquo;Ryedale&rdquo; or &ldquo;Eastwood&rdquo;.
            </span>
          </div>
        )}

        {noResults && (
          <div className={styles.propertyNote}>
            <span className={styles.propertyNoteWarning}>
              No property matches &ldquo;{trimmed}&rdquo; on {scope === 'Anything' ? 'any field' : scope.toLowerCase()}. Widen
              the match, or check the spelling.
            </span>
          </div>
        )}

        {hasResults && (
          <div className={styles.propertyResults}>
            <div className={styles.propertyResultsHeader}>
              <span>
                {matches.length} {matches.length === 1 ? 'property' : 'properties'} on {matchedRouteCount}{' '}
                {matchedRouteCount === 1 ? 'route' : 'routes'} — tap a route to isolate it below
              </span>
              <button type="button" className={styles.clearFiltersBtn} onClick={search.clear}>
                Clear search
              </button>
            </div>

            {matches.map((match) => (
              <div key={match.key} className={styles.propertyResultRow}>
                <div className={styles.propertyResultInfo}>
                  <div className={styles.propertyResultAddressRow}>
                    <span className={styles.propertyResultAddress}>{match.address}</span>
                    <span className={styles.propertyResultMatchLabel}>{match.matchLabel}</span>
                  </div>
                  <span className={styles.propertyResultMeta}>
                    {match.signs} signs · {match.agent} · {match.customerName}
                  </span>
                </div>
                <div className={styles.propertyResultRoutes}>
                  <span className={styles.propertyScopeLabel}>
                    {match.routes.length === 1 ? 'On 1 route' : `On ${match.routes.length} routes`}
                  </span>
                  <div className={styles.propertyRouteChips}>
                    {match.routes.map((r) => (
                      <Tag
                        key={r.routeId}
                        role="button"
                        aria-label={`Focus route ${r.routeCode}`}
                        aria-pressed={focusedRouteId === r.routeId}
                        selected={focusedRouteId === r.routeId}
                        onClick={() => toggleFocusRoute(r.routeId)}
                      >
                        <span className={styles.propertyRouteChipContent}>
                          <span className={styles.propertyRouteChipCode}>{r.routeCode}</span>
                          <span className={styles.propertyRouteChipDate}>{formatRouteDate(r.scheduledDate)}</span>
                          <RouteStatusPill route={r.route} />
                        </span>
                      </Tag>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
