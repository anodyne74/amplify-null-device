'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import OperatorRoute from '@/app/components/OperatorRoute';
import PageHeader from '@/app/administrator/components/PageHeader';
import { Card } from '@/app/components/ui/core/Card';
import { Badge } from '@/app/components/ui/core/Badge';
import { Button } from '@/app/components/ui/core/Button';
import { Field } from '@/app/components/ui/forms/Field';
import { AddressAutocompleteInput, type ResolvedAddress } from '@/app/operator/components/AddressAutocompleteInput';
import type { Pin, PropertyReview } from '@/lib/locationReview';
import { confirmPropertyLocation, dismissSuburbMismatch, listLocationReviewQueue } from '@/lib/propertyLocations';
import { correctPropertyAddress, locateUnpinnedStops } from '@/lib/propertyAddressCorrection';
import styles from './page.module.css';

const PropertyPinMap = dynamic(() => import('./PropertyPinMap').then((mod) => mod.PropertyPinMap), { ssr: false });

function propertyAddress(review: PropertyReview): string {
  return review.stops.find((stop) => stop.address)?.address ?? review.propertyKey;
}

/**
 * Location review (#286): Properties with an Approximate pin, a Stop with no
 * pin (#344) or a suburb mismatch. Confirming a pin moves every Stop at the Property there and takes
 * it out of the queue; new Stops at the address use it instead of geocoding.
 */
export default function AdministratorLocationReviewPage() {
  const [queue, setQueue] = useState<PropertyReview[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await listLocationReviewQueue();
    setQueue(data);
    setLoadError(error ?? null);
    setSelectedKey((current) => (current && data.some((review) => review.propertyKey === current) ? current : (data[0]?.propertyKey ?? null)));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = queue.find((review) => review.propertyKey === selectedKey) ?? null;

  function resolve(propertyKey: string, remaining: PropertyReview | null) {
    const next = remaining
      ? queue.map((review) => (review.propertyKey === propertyKey ? remaining : review))
      : queue.filter((review) => review.propertyKey !== propertyKey);
    setQueue(next);
    if (!remaining) setSelectedKey(next[0]?.propertyKey ?? null);
  }

  return (
    <OperatorRoute requireAdmin>
      <div className={styles.page}>
        <PageHeader title="Location review" subtitle="Confirm where each Property really is" />

        {loading ? (
          <p className={styles.note}>Loading the review queue…</p>
        ) : loadError ? (
          <p className="nd-badge nd-badge--danger">{loadError}</p>
        ) : queue.length === 0 ? (
          <Card>
            <p className={styles.emptyState}>No Properties need review. Approximate pins, Stops with no pin and suburb mismatches appear here.</p>
          </Card>
        ) : (
          <div className={styles.layout}>
            <Card title={`${queue.length} ${queue.length === 1 ? 'Property' : 'Properties'} to review`}>
              <ul className={styles.queue}>
                {queue.map((review) => (
                  <li key={review.propertyKey}>
                    <button
                      type="button"
                      className={styles.queueItem}
                      aria-current={review.propertyKey === selectedKey ? 'true' : undefined}
                      onClick={() => setSelectedKey(review.propertyKey)}
                    >
                      <span className={styles.queueAddress}>{propertyAddress(review)}</span>
                      <span className={styles.badges}>
                        {review.noPin && <Badge tone="danger" size="sm">No pin</Badge>}
                        {review.approximate && <Badge tone="warning" size="sm">Approximate</Badge>}
                        {review.suburbMismatch && <Badge tone="info" size="sm">Suburb mismatch</Badge>}
                        <span className={styles.note}>
                          {review.stops.length} Stop{review.stops.length === 1 ? '' : 's'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>

            {selected && (
              <PropertyReviewCard
                key={selected.propertyKey}
                review={selected}
                onConfirmed={() => resolve(selected.propertyKey, null)}
                onDismissed={() =>
                  resolve(
                    selected.propertyKey,
                    selected.approximate || selected.noPin ? { ...selected, suburbMismatch: null } : null
                  )
                }
                onAddressCorrected={() => void load()}
              />
            )}
          </div>
        )}
      </div>
    </OperatorRoute>
  );
}

function PropertyReviewCard({
  review,
  onConfirmed,
  onDismissed,
  onAddressCorrected,
}: {
  review: PropertyReview;
  onConfirmed: () => void;
  onDismissed: () => void;
  onAddressCorrected: () => void;
}) {
  const suggested = review.suggestedPin;
  const startPin = suggested ?? review.currentPin;
  const [pin, setPin] = useState<Pin | null>(startPin ? { latitude: startPin.latitude, longitude: startPin.longitude } : null);
  const [correctedAddress, setCorrectedAddress] = useState('');
  const [pickedAddress, setPickedAddress] = useState<ResolvedAddress | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>, onDone: () => void) {
    setSaving(true);
    setError(null);
    const result = await action();
    setSaving(false);
    if (result.ok) onDone();
    else setError(result.error);
  }

  const unpinnedCount = review.stops.filter(
    (stop) => typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number'
  ).length;
  const addresses = [...new Set(review.stops.map((stop) => stop.address).filter((address): address is string => !!address))];

  return (
    <Card title={propertyAddress(review)} subtitle={`${review.stops.length} Stop${review.stops.length === 1 ? '' : 's'} at this Property`}>
      <div className={styles.detail}>
        {error && <p className="nd-badge nd-badge--danger">{error}</p>}

        {addresses.length > 1 && (
          <p className={styles.note}>Entered as: {addresses.join(' · ')}</p>
        )}

        {pin && (
          <PropertyPinMap pin={pin} currentPin={review.currentPin} suggestedPin={review.suggestedPin} onPinChange={setPin} />
        )}

        {suggested && (
          <p className={styles.note}>
            The suggested pin (G) is where the operator&apos;s device was when they placed signs
            {suggested.accuracyMeters !== null ? `, to within about ${Math.round(suggested.accuracyMeters)} m` : ''}.
          </p>
        )}

        <div className={styles.actions}>
          {suggested && (
            <Button
              size="sm"
              disabled={saving}
              onClick={() => {
                const suggestion = { latitude: suggested.latitude, longitude: suggested.longitude };
                void run(() => confirmPropertyLocation(review.propertyKey, suggestion, 'suggestion'), onConfirmed);
              }}
            >
              Accept suggested pin
            </Button>
          )}
          {pin && (
            <Button
              size="sm"
              variant={suggested ? 'secondary' : 'primary'}
              disabled={saving}
              onClick={() => void run(() => confirmPropertyLocation(review.propertyKey, pin, 'manual'), onConfirmed)}
            >
              Confirm pin
            </Button>
          )}
        </div>

        {(review.noPin || review.suburbMismatch) && (
          <div className={styles.fixes}>
            {review.noPin && (
              <>
                <p className={styles.note}>
                  {unpinnedCount} of {review.stops.length} Stop{review.stops.length === 1 ? '' : 's'} here{' '}
                  {unpinnedCount === 1 ? 'has' : 'have'} no map pin
                  {pin ? '' : ', so there is no pin to confirm yet'}. Try finding the entered address on the map again, or
                  correct it.
                </p>
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void run(() => locateUnpinnedStops(review.stops), onAddressCorrected)}
                  >
                    Find on map
                  </Button>
                </div>
              </>
            )}
            {review.suburbMismatch && (
              <>
                <p className={styles.note}>
                  The geocoder put this address in <strong>{review.suburbMismatch.geocodedSuburb}</strong>. The entered
                  address&apos;s suburb is kept; dismiss the flag if it&apos;s right, or correct the address on every Stop here.
                </p>
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={saving}
                    onClick={() => void run(() => dismissSuburbMismatch(review.propertyKey), onDismissed)}
                  >
                    Dismiss flag
                  </Button>
                </div>
              </>
            )}
            <form
              className={styles.correction}
              onSubmit={(event) => {
                event.preventDefault();
                void run(() => correctPropertyAddress(review.stops, correctedAddress, pickedAddress), onAddressCorrected);
              }}
            >
              <Field label="Corrected address" htmlFor={`correct-${review.propertyKey}`}>
                <AddressAutocompleteInput
                  id={`correct-${review.propertyKey}`}
                  value={correctedAddress}
                  placeholder={addresses[0]}
                  disabled={saving}
                  onChange={setCorrectedAddress}
                  onResolved={(resolved) => {
                    setPickedAddress(resolved);
                    if (resolved) setCorrectedAddress(resolved.formattedAddress);
                  }}
                  searchOrigin={review.currentPin}
                  className="nd-input"
                />
              </Field>
              <Button size="sm" variant="secondary" type="submit" disabled={saving || !correctedAddress.trim()}>
                Correct address
              </Button>
            </form>
          </div>
        )}
      </div>
    </Card>
  );
}
