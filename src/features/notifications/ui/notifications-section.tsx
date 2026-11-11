"use client";

import {
  useActionState,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Switch } from "@/components/ui/switch";
import { TimeField } from "@/components/ui/time-field";
import { urlBase64ToUint8Array } from "@/lib/push-client";
import {
  card,
  cardTitle,
  primaryButton,
  quietButton,
} from "@/features/settings/ui/styles";
import { initialSettingsState } from "@/features/settings/state";
import {
  removeDevice,
  saveNotificationTime,
  sendTestNotification,
  subscribePush,
  unsubscribePush,
} from "../actions";

export type DeviceView = {
  id: number;
  label: string;
  endpoint: string;
  addedLabel: string;
  lastLabel: string | null;
};

type Capability = "checking" | "ready" | "unsupported" | "ios-install";

// What this browser can do is only known on the client. The server snapshot is "checking", so
// the first paint matches and the real answer arrives without a hydration mismatch.
const noop = () => () => {};
function readCapability(): Capability {
  if (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  ) {
    return "ready";
  }
  // iPhone and iPad have no PushManager in an ordinary Safari tab: it needs the Home Screen app.
  const ios =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios-install" : "unsupported";
}
const readPermission = (): NotificationPermission | "unknown" =>
  "Notification" in window ? Notification.permission : "unknown";

const plusMinutes = (time: string, minutes: number) => {
  const [h = 0, m = 0] = time.split(":").map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

type Props = {
  /** "onboarding" is the bare switch inside another card; "settings" adds time, devices, test. */
  variant: "settings" | "onboarding";
  /** Public VAPID key, or null when the server has none (push not set up). */
  vapidKey: string | null;
  notificationTime: string;
  devices: DeviceView[];
};

export function NotificationsSection({
  variant,
  vapidKey,
  notificationTime,
  devices,
}: Props) {
  const t = useTranslations("settings.notifications");
  const settings = variant === "settings";
  const capability = useSyncExternalStore(
    noop,
    readCapability,
    () => "checking" as Capability,
  );
  const systemPermission = useSyncExternalStore(
    noop,
    readPermission,
    () => "unknown" as const,
  );

  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [endpoint, setEndpoint] = useState<string | null>(null); // this device's subscription
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"failed" | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [time, setTime] = useState(notificationTime);
  const [pending, startTransition] = useTransition();
  const [timeState, timeAction, timePending] = useActionState(
    saveNotificationTime,
    initialSettingsState,
  );

  const shownPermission = permission ?? systemPermission;
  const on = endpoint !== null;

  // Which subscription, if any, this browser already holds.
  useEffect(() => {
    if (capability !== "ready") return;
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!cancelled) setEndpoint(sub?.endpoint ?? null);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [capability]);

  // Called straight from the click: browsers only show the permission prompt for a user gesture,
  // so the permission request is the first thing that happens.
  async function enable() {
    if (!vapidKey) return;
    setBusy(true);
    setError(null);
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") return;
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const saved = await subscribePush(sub.toJSON());
      if (!saved.ok) {
        await sub.unsubscribe();
        setError("failed");
        return;
      }
      setEndpoint(sub.endpoint);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await unsubscribePush(sub.endpoint);
        await sub.unsubscribe();
      }
      setEndpoint(null);
    } catch {
      setError("failed");
    } finally {
      setBusy(false);
    }
  }

  function remove(d: DeviceView) {
    startTransition(async () => {
      if (d.endpoint === endpoint) {
        await disable();
      } else {
        await removeDevice(d.id);
      }
    });
  }

  function sendTest() {
    setTestMessage(null);
    startTransition(async () => {
      const r = await sendTestNotification();
      setTestMessage(
        r.ok
          ? t("test.sent", { count: r.sent })
          : r.error === "no_device"
            ? t("test.noDevice")
            : r.error === "not_configured"
              ? t("test.notConfigured")
              : t("test.failed"),
      );
    });
  }

  const control =
    capability === "checking" ? null : capability === "ios-install" ? (
      <div className="rounded-tile bg-fill-soft px-3.5 py-3 text-label">
        <p className="font-semibold">{t("ios.title")}</p>
        <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-ink-2">
          <li>{t("ios.step1")}</li>
          <li>{t("ios.step2")}</li>
          <li>{t("ios.step3")}</li>
        </ol>
        <p className="mt-2 text-caption text-ink-3">{t("ios.note")}</p>
      </div>
    ) : capability === "unsupported" ? (
      <p className="text-label text-ink-2">{t("unsupported")}</p>
    ) : !vapidKey ? (
      <p className="text-label text-ink-2">{t("notConfigured")}</p>
    ) : (
      <>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p id={`push-label-${variant}`} className="text-body font-medium">
              {t("toggle")}
            </p>
            <p className="text-caption text-ink-3 tabular">
              {t("arrival", { from: time, to: plusMinutes(time, 10) })}
            </p>
          </div>
          <Switch
            checked={on}
            onChange={(next) => void (next ? enable() : disable())}
            labelledBy={`push-label-${variant}`}
            disabled={busy || shownPermission === "denied"}
          />
        </div>
        {shownPermission === "denied" ? (
          <p
            role="status"
            className="mt-3 rounded-tile bg-warn-surface px-3 py-2 text-label font-medium text-warn-ink"
          >
            {t("denied")}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-label">
            {t("error")}
          </p>
        ) : null}
      </>
    );

  const body = (
    <>
      {control}
      {settings ? (
        <>
          <form
            action={timeAction}
            className="mt-5 flex flex-wrap items-end gap-3"
          >
            <div className="w-40">
              <TimeField
                id="notificationTime"
                name="notificationTime"
                label={t("time")}
                value={time}
                onChange={setTime}
                labels={{
                  hours: t("hours"),
                  minutes: t("minutes"),
                  done: t("done"),
                }}
              />
            </div>
            <button
              type="submit"
              disabled={timePending}
              className={`${primaryButton} min-h-12`}
            >
              {timePending ? t("saving") : t("saveTime")}
            </button>
            <p role="status" className="basis-full text-label">
              {timeState.status === "saved" ? t("saved") : null}
              {timeState.status === "invalid" || timeState.status === "failed"
                ? t("error")
                : null}
            </p>
          </form>

          <div className="mt-5 border-t border-divider pt-4">
            <h3 className="text-label font-semibold">{t("devices.title")}</h3>
            {devices.length === 0 ? (
              <p className="mt-1 text-caption text-ink-3">
                {t("devices.none")}
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-divider">
                {devices.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-label font-medium">
                        {d.label}
                        {d.endpoint === endpoint ? (
                          <span className="rounded-chip bg-primary px-2 py-0.5 text-micro font-semibold text-primary-ink">
                            {t("devices.thisDevice")}
                          </span>
                        ) : null}
                      </p>
                      <p className="text-caption text-ink-3 tabular">
                        {t("devices.added", { date: d.addedLabel })} ·{" "}
                        {d.lastLabel
                          ? t("devices.last", { time: d.lastLabel })
                          : t("devices.never")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(d)}
                      disabled={pending || busy}
                      aria-label={t("devices.removeAria", { name: d.label })}
                      className={`${quietButton} shrink-0`}
                    >
                      {t("devices.remove")}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {devices.length > 0 ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={pending}
                  className={quietButton}
                >
                  <Icon name="refresh" className="mr-1.5 size-5" />
                  {t("test.button")}
                </button>
                <p role="status" className="mt-1.5 text-caption text-ink-3">
                  {testMessage}
                </p>
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </>
  );

  if (!settings) return body;
  return (
    <section aria-labelledby="notifications-title" className={card}>
      <h2 id="notifications-title" className={cardTitle}>
        {t("title")}
      </h2>
      <div className="mt-3">{body}</div>
    </section>
  );
}
