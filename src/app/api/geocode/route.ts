import { getLocale } from "next-intl/server";
import { NextResponse, type NextRequest } from "next/server";
import {
  GeocodingError,
  searchPlaces,
} from "@/features/forecast/data/geocodingClient";
import { createClient } from "@/lib/supabase/server";

const MIN_QUERY = 2;
const MAX_QUERY = 100;

/**
 * GET /api/geocode?q=... (plan §4.5, §10.1). Signed-in users only. proxy.ts already answers 401
 * for signed-out requests; the session is checked again here because security checks are not
 * left to the proxy alone (§10.2). The client debounces 400 ms; the length rule is enforced here too.
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < MIN_QUERY || q.length > MAX_QUERY) {
    return NextResponse.json({ error: "invalid_query" }, { status: 400 });
  }

  const language = (await getLocale()) === "en" ? "en" : "th";
  try {
    const results = await searchPlaces({ query: q, language });
    return NextResponse.json(
      { results },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (err) {
    if (err instanceof GeocodingError) {
      return NextResponse.json(
        { error: "upstream_unavailable" },
        { status: 502 },
      );
    }
    throw err;
  }
}
