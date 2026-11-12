-- Weather advisories, phase C (plan §23.6): the owner's advisory settings.
--
--   * advisories_disabled: groups switched off in Settings. Only the known group names are
--     allowed; thunderstorm and heavy rain belong to no group, so they cannot be switched off.
--   * temperature_offset: -3..+3 °C added to the heat and cold thresholds.
-- Both have defaults, so existing rows behave exactly as before. The settings policies and the
-- table-level grants already cover new columns.

alter table public.settings
  add column advisories_disabled text[] not null default '{}'
    check (advisories_disabled <@ array['heatCold', 'sun', 'windVisibility', 'rainExtras', 'airQuality']::text[]),
  add column temperature_offset smallint not null default 0
    check (temperature_offset between -3 and 3);
