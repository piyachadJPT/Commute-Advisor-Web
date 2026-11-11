"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { saveLocation } from "../actions";
import { initialSettingsState } from "../state";
import { fieldLabel, input, primaryButton, quietButton } from "./styles";

type Place = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string | null;
  admin1: string | null;
};
type Found = { q: string; places: Place[] | null }; // places null = the request failed

const DEBOUNCE_MS = 400; // plan §4.4
const MIN_CHARS = 2;
const NUMBER = /^-?\d+(\.\d+)?$/;

/** Place search, current location or manual coordinates. One form, one Server Action. */
export function LocationPicker({
  locationKey,
  initialName,
}: {
  locationKey: "home" | "work";
  initialName: string;
}) {
  const t = useTranslations("settings.location");
  const [state, action, pending] = useActionState(
    saveLocation,
    initialSettingsState,
  );
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [name, setName] = useState(initialName);
  const [geo, setGeo] = useState<"idle" | "locating" | "denied">("idle");

  const q = query.trim();
  useEffect(() => {
    if (q.length < MIN_CHARS) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setFound({ q, places: null });
          return;
        }
        const body = (await res.json()) as { results: Place[] };
        setFound({ q, places: body.results });
      } catch {
        if (!controller.signal.aborted) setFound({ q, places: null });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  // Results are only shown for the query they were fetched for, so a stale list never lingers.
  const current = found?.q === q ? found : null;
  const searching = q.length >= MIN_CHARS && current === null;
  const canSave = NUMBER.test(lat) && NUMBER.test(lon);

  function choose(p: Place) {
    setLat(String(p.latitude));
    setLon(String(p.longitude));
    setName([p.name, p.admin1].filter(Boolean).join(", ").slice(0, 80));
  }

  function useMyLocation() {
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLon(pos.coords.longitude.toFixed(5));
        setName(t("currentName"));
        setGeo("idle");
      },
      () => setGeo("denied"),
      { timeout: 10_000 },
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="key" value={locationKey} />

      <div>
        <label htmlFor="place-search" className={fieldLabel}>
          {t("search")}
        </label>
        <input
          id="place-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-describedby="place-search-status"
          className={input}
        />
        <p
          id="place-search-status"
          role="status"
          className="mt-1.5 text-caption text-ink-3"
        >
          {q.length < MIN_CHARS
            ? t("searchHint")
            : searching
              ? t("searching")
              : current?.places === null
                ? t("searchFailed")
                : current?.places.length === 0
                  ? t("noResults")
                  : null}
        </p>
        {current?.places && current.places.length > 0 ? (
          <ul className="mt-2 divide-y divide-divider overflow-hidden rounded-control border border-divider bg-glass-strong">
            {current.places.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p)}
                  className="flex min-h-12 w-full flex-col items-start justify-center px-3.5 py-2 text-left transition-colors duration-(--duration-fast) hover:bg-fill-soft"
                >
                  <span className="text-body font-medium">{p.name}</span>
                  <span className="text-caption text-ink-3">
                    {[p.admin1, p.country].filter(Boolean).join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div>
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geo === "locating"}
          className={quietButton}
        >
          <Icon name="locationOn" className="mr-1.5 size-5" />
          {geo === "locating" ? t("locating") : t("useCurrent")}
        </button>
        {geo === "denied" ? (
          <p role="status" className="mt-2 text-caption">
            {t("geoDenied")}
          </p>
        ) : null}
      </div>

      <details
        className="rounded-control border border-divider px-3.5 py-2"
        open={lat !== "" || lon !== ""}
      >
        <summary className="min-h-11 cursor-pointer py-2 text-label font-semibold">
          {t("manual")}
        </summary>
        <div className="grid gap-4 pt-2 pb-2 sm:grid-cols-2">
          <div>
            <label htmlFor="latitude" className={fieldLabel}>
              {t("latitude")}
            </label>
            <input
              id="latitude"
              name="latitude"
              inputMode="decimal"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className={`${input} tabular-nums`}
            />
          </div>
          <div>
            <label htmlFor="longitude" className={fieldLabel}>
              {t("longitude")}
            </label>
            <input
              id="longitude"
              name="longitude"
              inputMode="decimal"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className={`${input} tabular-nums`}
            />
          </div>
        </div>
      </details>

      <div>
        <label htmlFor="place-name" className={fieldLabel}>
          {t("name")}
        </label>
        <input
          id="place-name"
          name="name"
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={input}
        />
        <p className="mt-1.5 text-caption text-ink-3">{t("precisionNote")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !canSave}
          className={primaryButton}
        >
          {pending ? t("saving") : t("save")}
        </button>
        <p role="status" className="text-label">
          {state.status === "invalid" ? t("invalid") : null}
          {state.status === "failed" ? t("failed") : null}
        </p>
      </div>
    </form>
  );
}
