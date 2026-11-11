"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Combobox } from "@/components/ui/combobox";
import { Disclosure } from "@/components/ui/disclosure";
import { TextField } from "@/components/ui/text-field";
import { saveLocation } from "../actions";
import { initialSettingsState } from "../state";
import { fieldLabel, primaryButton, quietButton } from "./styles";

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
  returnTo = "settings",
}: {
  locationKey: "home" | "work";
  initialName: string;
  /** Where saving goes next. A fixed choice, resolved on the server. */
  returnTo?: "settings" | "onboarding";
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
  const [manualOpen, setManualOpen] = useState(false);
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
  const places = q.length >= MIN_CHARS ? (current?.places ?? []) : [];

  const status =
    q.length < MIN_CHARS
      ? t("searchHint")
      : searching
        ? t("searching")
        : current?.places === null
          ? t("searchFailed")
          : current?.places.length === 0
            ? t("noResults")
            : null;

  function choose(id: string) {
    const p = places.find((x) => String(x.id) === id);
    if (!p) return;
    setLat(String(p.latitude));
    setLon(String(p.longitude));
    setName([p.name, p.admin1].filter(Boolean).join(", ").slice(0, 80));
    setManualOpen(true);
  }

  function useMyLocation() {
    setGeo("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLon(pos.coords.longitude.toFixed(5));
        setName(t("currentName"));
        setManualOpen(true);
        setGeo("idle");
      },
      () => setGeo("denied"),
      { timeout: 10_000 },
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="key" value={locationKey} />
      <input type="hidden" name="returnTo" value={returnTo} />

      <Combobox
        id="place-search"
        label={t("search")}
        value={query}
        onChange={setQuery}
        options={places.map((p) => ({
          id: String(p.id),
          label: p.name,
          description: [p.admin1, p.country].filter(Boolean).join(", "),
        }))}
        onSelect={(o) => choose(o.id)}
        status={status}
        listLabel={t("results")}
      />

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

      <Disclosure
        label={t("manual")}
        open={manualOpen}
        onToggle={() => setManualOpen((o) => !o)}
      >
        <div className="grid gap-4 pt-1 sm:grid-cols-2">
          <div>
            <label htmlFor="latitude" className={fieldLabel}>
              {t("latitude")}
            </label>
            <TextField
              id="latitude"
              name="latitude"
              inputMode="decimal"
              autoComplete="off"
              value={lat}
              onChange={(e) => setLat(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <div>
            <label htmlFor="longitude" className={fieldLabel}>
              {t("longitude")}
            </label>
            <TextField
              id="longitude"
              name="longitude"
              inputMode="decimal"
              autoComplete="off"
              value={lon}
              onChange={(e) => setLon(e.target.value)}
              className="tabular-nums"
            />
          </div>
        </div>
      </Disclosure>

      <div>
        <label htmlFor="place-name" className={fieldLabel}>
          {t("name")}
        </label>
        <TextField
          id="place-name"
          name="name"
          maxLength={80}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
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
