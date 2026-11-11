import { geocodingResponseSchema } from "./openMeteoSchema";

export const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const TIMEOUT_MS = 10_000;

export type GeocodingResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string | null;
  admin1: string | null;
};

export class GeocodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeocodingError";
  }
}

/** Place-name search (plan §4.4). Callers must enforce the 2-character minimum. */
export async function searchPlaces(opts: {
  query: string;
  language: "th" | "en";
  fetchImpl?: typeof fetch;
}): Promise<GeocodingResult[]> {
  const params = new URLSearchParams({
    name: opts.query,
    count: "10",
    language: opts.language,
  });
  let res: Response;
  try {
    res = await (opts.fetchImpl ?? fetch)(`${GEOCODING_URL}?${params}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new GeocodingError("Geocoding request failed");
  }
  if (!res.ok) throw new GeocodingError(`Geocoding HTTP ${res.status}`);

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new GeocodingError("Geocoding returned malformed JSON");
  }
  const parsed = geocodingResponseSchema.safeParse(json);
  if (!parsed.success)
    throw new GeocodingError("Unexpected geocoding response");

  return (parsed.data.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    latitude: r.latitude,
    longitude: r.longitude,
    country: r.country ?? null,
    admin1: r.admin1 ?? null,
  }));
}
