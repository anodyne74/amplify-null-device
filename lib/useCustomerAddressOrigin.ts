import { useEffect, useState } from 'react';
import { geocodeAddress } from '@/lib/googleMaps';

export interface AddressOrigin {
  latitude: number;
  longitude: number;
}

/**
 * Where a Customer's own address is on the map, to bias a Stop's address
 * search toward it. Null while it is being looked up, when there is no
 * address, and when the lookup fails: it only ever helps the search and never
 * blocks a screen.
 */
export function useCustomerAddressOrigin(addressLine1: string | null | undefined): AddressOrigin | null {
  const [origin, setOrigin] = useState<AddressOrigin | null>(null);

  useEffect(() => {
    if (!addressLine1) {
      setOrigin(null);
      return;
    }

    let cancelled = false;
    void geocodeAddress(addressLine1)
      .then((resolved) => {
        if (!cancelled) setOrigin({ latitude: resolved.latitude, longitude: resolved.longitude });
      })
      .catch(() => {
        if (!cancelled) setOrigin(null);
      });

    return () => {
      cancelled = true;
    };
  }, [addressLine1]);

  return origin;
}
