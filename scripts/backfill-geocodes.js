#!/usr/bin/env node

import fs from 'node:fs';
import readline from 'node:readline/promises';

function parseArgs(argv) {
  const args = {
    customerId: '',
    mode: 'dry-run',
    confirmApply: false,
    outputsPath: 'amplify_outputs.json',
    authMode: 'userPool',
    username: '',
    password: '',
    force: false,
    assess: false,
    delayMs: 200,
    limit: Infinity,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === '--customer-id' && next) {
      args.customerId = next;
      i += 1;
      continue;
    }
    if (arg === '--mode' && next) {
      args.mode = next;
      i += 1;
      continue;
    }
    if (arg === '--confirm-apply') {
      args.confirmApply = true;
      continue;
    }
    if (arg === '--outputs-path' && next) {
      args.outputsPath = next;
      i += 1;
      continue;
    }
    if (arg === '--auth-mode' && next) {
      args.authMode = next;
      i += 1;
      continue;
    }
    if (arg === '--username' && next) {
      args.username = next;
      i += 1;
      continue;
    }
    if (arg === '--password' && next) {
      args.password = next;
      i += 1;
      continue;
    }
    if (arg === '--force') {
      args.force = true;
      continue;
    }
    if (arg === '--assess') {
      args.assess = true;
      continue;
    }
    if (arg === '--delay-ms' && next) {
      args.delayMs = Number(next);
      i += 1;
      continue;
    }
    if (arg === '--limit' && next) {
      args.limit = Number(next);
      i += 1;
      continue;
    }
  }

  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/backfill-geocodes.js \
    [--customer-id <customer-id>] \
    [--assess] \
    [--mode dry-run|apply] \
    [--confirm-apply] \
    [--outputs-path amplify_outputs.json] \
    [--auth-mode userPool|iam] \
    [--username <cognito-username-or-email>] \
    [--password <cognito-password>] \
    [--force] \
    [--delay-ms 200] \
    [--limit 200]

  Geocodes every Stop belonging to --customer-id that is missing latitude/longitude,
  using the Google Geocoding REST API (server-side, no browser). Requires
  GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the environment.

  --force re-geocodes stops that already have coordinates too -- except Confirmed
  ones, which are never moved.

  --assess (Location Precision, #284) re-geocodes every Stop -- all of them in the
  target environment unless --customer-id narrows it -- and writes ONLY its
  precision level, geocode signals, address components and Property key (#287).
  It never changes address, formattedAddress, latitude or longitude (earlier
  backfills hand-corrected those), and a Confirmed Stop gets only its address
  components and Property key. Prints counts per precision level,
  the Approximate Stops, and suburb mismatches (entered addresses that don't
  mention the geocoder's suburb). Run it once per branch environment via
  --outputs-path.
  --delay-ms throttles requests between stops (default 200ms) to stay under
  Google's per-second quota.

  Auth notes:
    - Default auth mode is userPool.
    - Prefer environment variables for credentials:
      IMPORT_PREP_USERNAME, IMPORT_PREP_PASSWORD
`);
}

function validateArgs(args) {
  if (!args.customerId && !args.assess) {
    usage();
    throw new Error('Missing required arg: --customer-id');
  }
  if (!['dry-run', 'apply'].includes(args.mode)) {
    throw new Error(`Unsupported mode '${args.mode}'. Use dry-run or apply.`);
  }
  if (args.mode === 'apply' && !args.confirmApply) {
    throw new Error('Apply mode requires --confirm-apply to protect against accidental writes.');
  }
  if (!['userPool', 'iam'].includes(args.authMode)) {
    throw new Error(`Unsupported auth mode '${args.authMode}'. Use userPool or iam.`);
  }
}

async function confirmApply(stopsToGeocode) {
  const isInteractive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (!isInteractive) {
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`About to geocode and update ${stopsToGeocode.length} stop(s).`);
    const answer = await rl.question('Type yes to write these updates to Amplify Data: ');
    if (answer.trim().toLowerCase() !== 'yes') {
      throw new Error('Apply cancelled by user.');
    }
  } finally {
    rl.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors classifyLocationPrecision and parseAddressComponents in
// lib/locationPrecision.ts (that module is TS built for the Next.js app and isn't
// imported directly by this standalone Node script). The test in
// scripts/__tests__/backfill-geocodes.test.ts runs both against the same cases.
const APPROXIMATE_RESULT_TYPES = ['route', 'locality'];

function classifyLocationPrecision(signals) {
  const topType = signals.resultTypes?.[0];
  if (signals.partialMatch || (topType && APPROXIMATE_RESULT_TYPES.includes(topType))) {
    return 'approximate';
  }
  if (signals.locationType === 'ROOFTOP' && signals.streetNumber) return 'precise';
  if (signals.locationType === 'RANGE_INTERPOLATED') return 'interpolated';
  return 'approximate';
}

const COMPONENT_TYPES = {
  streetNumber: 'street_number',
  street: 'route',
  suburb: 'locality',
  postcode: 'postal_code',
};

function parseAddressComponents(components) {
  const parsed = {};
  for (const [key, type] of Object.entries(COMPONENT_TYPES)) {
    const value = components?.find((component) => component.types?.includes(type))?.long_name;
    if (value) parsed[key] = value;
  }
  return parsed;
}

function toGeocodedLocation(result) {
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;
  const formattedAddress = result?.formatted_address;

  if (typeof lat !== 'number' || typeof lng !== 'number' || !formattedAddress) {
    throw new Error('Address validation returned incomplete location data.');
  }

  const locationType = result.geometry.location_type;
  const resultTypes = result.types ?? [];
  const partialMatch = result.partial_match === true;
  const addressComponents = parseAddressComponents(result.address_components);

  return {
    formattedAddress,
    latitude: lat,
    longitude: lng,
    locationPrecision: classifyLocationPrecision({
      locationType,
      resultTypes,
      partialMatch,
      streetNumber: addressComponents.streetNumber,
    }),
    ...(locationType ? { locationType } : {}),
    resultTypes,
    partialMatch,
    addressComponents,
  };
}

// Mirrors propertyKey in lib/propertyKey.ts (see the note above
// classifyLocationPrecision); the test runs both against the same cases.
const STREET_TYPES = {
  av: 'avenue',
  ave: 'avenue',
  bvd: 'boulevard',
  blvd: 'boulevard',
  cct: 'circuit',
  cl: 'close',
  cr: 'crescent',
  cres: 'crescent',
  ct: 'court',
  dr: 'drive',
  esp: 'esplanade',
  gr: 'grove',
  gve: 'grove',
  hwy: 'highway',
  ln: 'lane',
  pde: 'parade',
  pkwy: 'parkway',
  pl: 'place',
  rd: 'road',
  sq: 'square',
  st: 'street',
  tce: 'terrace',
};

const STATES = /\b(nsw|vic|qld|sa|wa|tas|nt|act)\b/g;

const STREET_NUMBER_AND_STREET =
  /^\s*(?:(?:unit|u|apt|apartment|shop|suite)\s*\d+[a-z]?\s*[,/]?\s*|\d+[a-z]?\s*\/\s*)?(\d+[a-z]?(?:-\d+[a-z]?)?)\s+([^,]+)/i;

function normalise(text) {
  return text
    .toLowerCase()
    .replace(/[.'’]/g, '')
    .replace(/[^a-z0-9-]+/g, ' ')
    .trim();
}

function normaliseStreet(street) {
  const words = normalise(street).split(' ');
  const last = words.length - 1;
  words[last] = STREET_TYPES[words[last]] ?? words[last];
  return words.join(' ');
}

function enteredSuburb(address) {
  const segments = address.split(',').slice(1);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    const suburb = normalise(segments[i]).replace(STATES, '').replace(/\b\d{4}\b/g, '').replace('australia', '').trim();
    if (suburb && !/^\d/.test(suburb)) return suburb.replace(/\s+/g, ' ');
  }
  return undefined;
}

function propertyKey(address, components) {
  const entered = address.match(STREET_NUMBER_AND_STREET);
  const streetNumber = components.streetNumber?.toLowerCase() ?? entered?.[1].toLowerCase();
  const street = components.street ?? entered?.[2];
  const geocodedSuburb = components.suburb ? normalise(components.suburb) : undefined;
  const suburb = enteredSuburb(address) ?? geocodedSuburb;
  if (!streetNumber || !street || !suburb) return undefined;

  const enteredPostcode = address.match(/\b(\d{4})\s*(?:,?\s*australia)?\s*$/i)?.[1];
  const postcode = enteredPostcode ?? (geocodedSuburb === suburb ? components.postcode : undefined) ?? '';
  return [suburb, postcode, normaliseStreet(street), streetNumber].join('|');
}

/** The plain geocode's candidates: Stops missing coordinates, or with --force all but Confirmed ones (never moved). */
function selectGeocodeCandidates(stops, force) {
  return stops.filter((stop) =>
    force
      ? stop.locationPrecision !== 'confirmed'
      : typeof stop.latitude !== 'number' || typeof stop.longitude !== 'number'
  );
}

/** Assess mode's candidates: every Stop with an address (Confirmed ones still need a Property key). */
function selectAssessCandidates(stops) {
  return stops.filter((stop) => stop.address?.trim());
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The assess-mode update for one Stop -- precision, geocode signals, address
 * components and Property key only, never the address or coordinates; a
 * Confirmed Stop keeps its precision too (as stopLocationUpdate in
 * lib/locationPrecision.ts) -- and whether the entered
 * address fails to mention the geocoder's suburb (the entered address wins,
 * CONTEXT.md "Property", so a mismatch is a Stop worth a human look).
 */
function assessStop(stop, geocoded) {
  const components = geocoded.addressComponents;
  const update =
    stop.locationPrecision === 'confirmed'
      ? { id: stop.id }
      : {
          id: stop.id,
          locationPrecision: geocoded.locationPrecision,
          geocodeLocationType: geocoded.locationType,
          geocodeResultTypes: geocoded.resultTypes,
          geocodePartialMatch: geocoded.partialMatch,
        };
  if (components.streetNumber) update.addressStreetNumber = components.streetNumber;
  if (components.street) update.addressStreet = components.street;
  if (components.suburb) update.addressSuburb = components.suburb;
  if (components.postcode) update.addressPostcode = components.postcode;
  const key = propertyKey(stop.address, components);
  if (key) update.propertyKey = key;

  const suburbMismatch = Boolean(
    components.suburb && !new RegExp(`\\b${escapeRegExp(components.suburb)}\\b`, 'i').test(stop.address ?? '')
  );
  return { stop, update, suburbMismatch };
}

function summarizeAssessment(assessments) {
  const counts = { precise: 0, interpolated: 0, approximate: 0, confirmed: 0 };
  for (const { update } of assessments) counts[update.locationPrecision ?? 'confirmed'] += 1;
  return {
    counts,
    approximate: assessments.filter(({ update }) => update.locationPrecision === 'approximate').map(({ stop }) => stop),
    suburbMismatches: assessments.filter(({ suburbMismatch }) => suburbMismatch).map(({ stop }) => stop),
  };
}

// Mirrors the non-browser code path in lib/googleMaps.ts's geocodeAddress(), Australia only.
async function geocodeAddress(address, apiKey) {
  const params = new URLSearchParams({ address: address.trim(), components: 'country:AU', key: apiKey });
  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`);
  if (!response.ok) {
    throw new Error('Failed to validate address with Google Geocoding API.');
  }

  const payload = await response.json();
  if (payload.status !== 'OK' || !payload.results || payload.results.length === 0) {
    const reason = payload.error_message ? ` ${payload.error_message}` : '';
    throw new Error(`Address could not be validated.${reason}`.trim());
  }

  return toGeocodedLocation(payload.results[0]);
}

function printAssessment({ counts, approximate, suburbMismatches }) {
  console.log(
    `Location Precision: ${counts.precise} precise, ${counts.interpolated} interpolated, ${counts.approximate} approximate, ${counts.confirmed} confirmed (unchanged).`
  );
  console.log(`Approximate Stops (${approximate.length}):`);
  for (const stop of approximate) console.log(`  - ${stop.id}: ${stop.address}`);
  console.log(`Suburb mismatches -- entered address doesn't mention the geocoder's suburb (${suburbMismatches.length}):`);
  for (const stop of suburbMismatches) console.log(`  - ${stop.id}: ${stop.address}`);
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    validateArgs(args);

    const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      throw new Error('Set GOOGLE_MAPS_API_KEY or NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in the environment.');
    }

    const { Amplify } = await import('aws-amplify');
    const { generateClient } = await import('aws-amplify/data');
    const { signIn } = await import('aws-amplify/auth');

    const outputsRaw = fs.readFileSync(args.outputsPath, 'utf8');
    Amplify.configure(JSON.parse(outputsRaw));

    const authMode = args.authMode;
    if (authMode === 'userPool') {
      const username = args.username || process.env.IMPORT_PREP_USERNAME;
      const password = args.password || process.env.IMPORT_PREP_PASSWORD;
      if (!username || !password) {
        throw new Error(
          'User Pool auth requires credentials. Set IMPORT_PREP_USERNAME and IMPORT_PREP_PASSWORD or pass --username/--password.'
        );
      }
      await signIn({ username, password });
    }

    const client = generateClient();

    console.log(args.customerId ? `Listing stops for customer ${args.customerId}...` : 'Listing all stops...');
    let allStops = [];
    let nextToken;
    do {
      const page = await client.models.Stop.list({
        ...(args.customerId ? { filter: { customerId: { eq: args.customerId } } } : {}),
        limit: 200,
        nextToken,
        authMode,
      });
      allStops = allStops.concat(page.data || []);
      nextToken = page.nextToken;
    } while (nextToken);

    const candidates = (
      args.assess ? selectAssessCandidates(allStops) : selectGeocodeCandidates(allStops, args.force)
    ).slice(0, args.limit);

    console.log(`Found ${allStops.length} stop(s) total, ${candidates.length} to ${args.assess ? 'assess' : 'geocode'}.`);
    if (candidates.length === 0) {
      return;
    }

    if (args.mode === 'apply') {
      await confirmApply(candidates);
    }

    const summary = { geocoded: 0, updated: 0, failed: 0, errors: [] };
    const assessments = [];

    for (let index = 0; index < candidates.length; index += 1) {
      const stop = candidates[index];
      try {
        const geocoded = await geocodeAddress(stop.address, apiKey);
        summary.geocoded += 1;

        if (args.assess) {
          const assessment = assessStop(stop, geocoded);
          assessments.push(assessment);
          console.log(`  -> ${index + 1}/${candidates.length}: ${stop.address} => ${geocoded.locationPrecision}`);
          if (args.mode === 'apply') {
            await client.models.Stop.update(assessment.update, { authMode });
            summary.updated += 1;
          }
        } else {
          console.log(`  -> ${index + 1}/${candidates.length}: ${stop.address} => ${geocoded.latitude}, ${geocoded.longitude}`);
        }

        if (args.mode === 'apply' && !args.assess) {
          await client.models.Stop.update(
            {
              id: stop.id,
              latitude: geocoded.latitude,
              longitude: geocoded.longitude,
              formattedAddress: geocoded.formattedAddress,
            },
            { authMode }
          );
          summary.updated += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.failed += 1;
        summary.errors.push(`${stop.id} (${stop.address}): ${message}`);
      }

      if (args.delayMs > 0 && index < candidates.length - 1) {
        await sleep(args.delayMs);
      }
    }

    console.log(
      `Done. Geocoded ${summary.geocoded}/${candidates.length}, ` +
      `updated ${summary.updated}, failed ${summary.failed}.`
    );
    if (args.assess) {
      printAssessment(summarizeAssessment(assessments));
    }
    if (summary.errors.length > 0) {
      console.log('Errors:');
      for (const err of summary.errors) {
        console.log(`  - ${err}`);
      }
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

if (process.argv[1]?.endsWith('backfill-geocodes.js')) {
  void main();
}

export {
  assessStop,
  classifyLocationPrecision,
  geocodeAddress,
  parseAddressComponents,
  parseArgs,
  propertyKey,
  selectAssessCandidates,
  selectGeocodeCandidates,
  summarizeAssessment,
  toGeocodedLocation,
};
