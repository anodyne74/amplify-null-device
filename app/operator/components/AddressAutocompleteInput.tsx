'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './AddressAutocompleteInput.module.css';

export interface ResolvedAddress {
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

interface Prediction {
  placeId: string;
  description: string;
}

interface AddressAutocompleteInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onResolved: (resolved: ResolvedAddress | null) => void;
  searchOrigin?: { latitude: number; longitude: number } | null;
  searchRadiusMeters?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function AddressAutocompleteInput({
  id,
  value,
  onChange,
  onResolved,
  searchOrigin,
  searchRadiusMeters = 50000,
  disabled,
  placeholder,
  className,
}: AddressAutocompleteInputProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loadError, setLoadError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = id ? `${id}-suggestions` : 'address-suggestions';

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      requestAbortRef.current?.abort();
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchPredictions = (input: string) => {
    if (!apiKey) {
      setLoadError('Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
      setIsLoading(false);
      return;
    }

    if (input.trim().length < 3) {
      setIsLoading(false);
      setPredictions([]);
      setShowDropdown(false);
      setActiveIndex(-1);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    requestAbortRef.current?.abort();
    const controller = new AbortController();
    requestAbortRef.current = controller;

    const requestBody: Record<string, unknown> = { input: input.trim() };
    if (searchOrigin) {
      requestBody.locationBias = {
        circle: {
          center: {
            latitude: searchOrigin.latitude,
            longitude: searchOrigin.longitude,
          },
          radius: searchRadiusMeters,
        },
      };
    }

    fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
      },
      body: JSON.stringify(requestBody),
    })
      .then(async (response) => {
        if (!response.ok) {
          let details = '';
          try {
            const payload = await response.json();
            details = payload?.error?.message || '';
          } catch {
            // no-op: response body may not be JSON
          }
          throw new Error(
            `Failed to fetch address suggestions (${response.status}).${details ? ` ${details}` : ''}`
          );
        }
        return response.json();
      })
      .then((payload) => {
        const nextPredictions: Prediction[] = (payload?.suggestions || [])
          .map((suggestion: any) => ({
            placeId: suggestion?.placePrediction?.placeId,
            description: suggestion?.placePrediction?.text?.text,
          }))
          .filter((prediction: Prediction) => Boolean(prediction.placeId && prediction.description));

        setPredictions(nextPredictions);
        setShowDropdown(nextPredictions.length > 0);
        setActiveIndex(nextPredictions.length > 0 ? 0 : -1);
        setIsLoading(false);
      })
      .catch((error: Error) => {
        if (error.name === 'AbortError') return;
        setPredictions([]);
        setShowDropdown(false);
        setLoadError(error.message);
        setActiveIndex(-1);
        setIsLoading(false);
      });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    // Clear previously resolved coords when user edits manually
    onResolved(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchPredictions(newValue), 300);
  };

  const handleSelect = async (prediction: Prediction) => {
    setShowDropdown(false);
    setPredictions([]);
    setActiveIndex(-1);
    onChange(prediction.description);

    if (!apiKey) {
      onResolved(null);
      setLoadError('Google Maps API key is missing. Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.');
      return;
    }

    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${encodeURIComponent(prediction.placeId)}`,
        {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'formattedAddress,location',
          },
        }
      );

      if (!response.ok) {
        let details = '';
        try {
          const payload = await response.json();
          details = payload?.error?.message || '';
        } catch {
          // no-op: response body may not be JSON
        }
        throw new Error(
          `Failed to resolve selected address coordinates (${response.status}).${details ? ` ${details}` : ''}`
        );
      }

      const payload = await response.json();
      const latitude = payload?.location?.latitude;
      const longitude = payload?.location?.longitude;
      const formattedAddress = payload?.formattedAddress ?? prediction.description;

      if (typeof latitude === 'number' && typeof longitude === 'number') {
        onResolved({ formattedAddress, latitude, longitude });
      } else {
        onResolved(null);
      }
    } catch (error) {
      onResolved(null);
      setLoadError(
        error instanceof Error ? error.message : 'Failed to resolve selected address coordinates.'
      );
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || predictions.length === 0) {
      if (e.key === 'Escape') {
        setShowDropdown(false);
        setActiveIndex(-1);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % predictions.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev <= 0 ? predictions.length - 1 : prev - 1));
      return;
    }

    if (e.key === 'Enter') {
      if (activeIndex >= 0 && activeIndex < predictions.length) {
        e.preventDefault();
        void handleSelect(predictions[activeIndex]);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className={styles.wrapper}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={handleInputChange}
        onFocus={() => {
          if (predictions.length > 0) setShowDropdown(true);
        }}
        onKeyDown={handleInputKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        aria-controls={listboxId}
        aria-activedescendant={
          showDropdown && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        }
      />
      {loadError && (
        <p className={styles.loadError}>Address autocomplete unavailable: {loadError}</p>
      )}
      {(isLoading || (showDropdown && predictions.length > 0)) && (
        <ul id={listboxId} role="listbox" className={styles.dropdown}>
          {isLoading && <li className={styles.statusOption}>Searching addresses...</li>}
          {predictions.map((p, idx) => (
            <li
              key={p.placeId}
              id={`${listboxId}-option-${idx}`}
              role="option"
              aria-selected={activeIndex === idx}
              className={`${styles.option} ${activeIndex === idx ? styles.optionActive : ''}`}
              onMouseDown={(event) => {
                event.preventDefault();
                void handleSelect(p);
              }}
            >
              {p.description}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
