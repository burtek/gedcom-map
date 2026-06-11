import type { GpsCoords } from "@/lib/gedcom/types";

/** Nominatim JSON response shape (partial) */
interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

/** In-memory cache: place name -> coords (or null if geocoding failed) */
const geocodeCache = new Map<string, GpsCoords | null>();

/**
 * Geocode a place name using the OpenStreetMap Nominatim API.
 * Returns null if no result is found.
 *
 * Nominatim usage policy requires:
 * - A valid User-Agent identifying the application
 * - No more than 1 request per second
 *
 * The caller is responsible for rate-limiting when calling this function
 * for multiple places in sequence.
 */
export async function geocodePlaceName(
  name: string,
  signal?: AbortSignal,
): Promise<GpsCoords | null> {
  const cached = geocodeCache.get(name);
  if (cached !== undefined) return cached;

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", name);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");

  let result: GpsCoords | null = null;
  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": "gedcom-map/1.0 (https://github.com/burtek/gedcom-map)",
        "Accept-Language": "en",
      },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Nominatim returned HTTP ${response.status}`);
    }

    const data = (await response.json()) as NominatimResult[];
    if (data.length > 0) {
      const lat = parseFloat(data[0].lat);
      const lon = parseFloat(data[0].lon);
      if (!isNaN(lat) && !isNaN(lon)) {
        result = { lat, lon };
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") throw err;
    // Other errors: treat as not found
  }

  geocodeCache.set(name, result);
  return result;
}

/** Sleep for ms milliseconds (used for Nominatim rate limiting) */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Geocode a list of place names, rate-limited to 1 request/second.
 *  Returns a map of name -> coords (null means not found). */
export async function geocodePlaceNames(
  names: string[],
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<Map<string, GpsCoords | null>> {
  const results = new Map<string, GpsCoords | null>();
  let done = 0;

  for (const name of names) {
    if (signal?.aborted) break;

    // Check cache first (no network request, no delay needed)
    const cached = geocodeCache.get(name);
    if (cached !== undefined) {
      results.set(name, cached);
      done++;
      onProgress?.(done, names.length);
      continue;
    }

    const coords = await geocodePlaceName(name, signal);
    results.set(name, coords);
    done++;
    onProgress?.(done, names.length);

    // Rate limit: wait 1.1s between requests to comply with Nominatim policy
    if (done < names.length) {
      await sleep(1100);
    }
  }

  return results;
}
