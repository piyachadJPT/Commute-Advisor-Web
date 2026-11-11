"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { submitAuth } from "./actions";
import { initialAuthState } from "./state";

const RESEND_SECONDS = 60; // Supabase allows one code per user per minute

const input =
  "block min-h-12 w-full rounded-control border border-divider bg-glass-strong px-3.5 text-body text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2";
const primary =
  "inline-flex min-h-12 w-full items-center justify-center rounded-control bg-primary px-4 text-body font-semibold text-primary-ink transition-opacity duration-(--duration-fast) hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const quiet =
  "inline-flex min-h-11 items-center rounded-control px-2 text-label font-semibold text-primary transition-colors duration-(--duration-fast) hover:bg-fill-soft disabled:cursor-not-allowed disabled:text-ink-3 disabled:hover:bg-transparent";

export function LoginForm({ next }: { next: string }) {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(submitAuth, initialAuthState);
  // Controlled on purpose: React resets uncontrolled fields after every form action, which
  // would wipe what the user typed when the server answers with an error.
  const [email, setEmail] = useState(state.email);
  const errorId = "auth-error";

  return (
    <div className="space-y-5">
      {state.step === "email" ? (
        <form action={action} className="space-y-4" noValidate>
          <input type="hidden" name="intent" value="request" />
          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-label font-medium"
            >
              {t("email.label")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              // Returning from the code step: put the cursor back (keyboard users lose focus otherwise).
              // Not on first load, so a phone keyboard does not pop up unasked.
              autoFocus={email.length > 0}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("email.placeholder")}
              aria-invalid={state.error === "invalidEmail"}
              aria-describedby={state.error ? errorId : undefined}
              className={input}
            />
          </div>
          <ErrorLine id={errorId} error={state.error} />
          <button type="submit" disabled={pending} className={primary}>
            {pending ? t("email.sending") : t("email.submit")}
          </button>
        </form>
      ) : (
        <>
          <form action={action} className="space-y-4" noValidate>
            <input type="hidden" name="intent" value="verify" />
            <input type="hidden" name="email" value={state.email} />
            <input type="hidden" name="next" value={next} />
            <div>
              <label
                htmlFor="code"
                className="mb-1.5 block text-label font-medium"
              >
                {t("code.label")}
              </label>
              <input
                id="code"
                name="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                aria-invalid={state.error === "invalidCode"}
                aria-describedby={state.error ? errorId : "code-hint"}
                className={`${input} text-center text-numeral tracking-[0.35em] tabular`}
              />
              <p id="code-hint" className="mt-1.5 text-caption text-ink-3">
                {t("code.hint", { email: state.email })}
              </p>
            </div>
            <ErrorLine id={errorId} error={state.error} />
            <button type="submit" disabled={pending} className={primary}>
              {pending ? t("code.verifying") : t("code.submit")}
            </button>
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3">
            <form action={action}>
              <input type="hidden" name="intent" value="request" />
              <input type="hidden" name="email" value={state.email} />
              <ResendButton sentAt={state.sentAt} pending={pending} />
            </form>
            <form action={action}>
              <input type="hidden" name="email" value={state.email} />
              <button
                type="submit"
                name="intent"
                value="change"
                className={quiet}
              >
                {t("code.changeEmail")}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

function ErrorLine({ id, error }: { id: string; error: string | null }) {
  const t = useTranslations("auth.error");
  if (!error) return null;
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-label font-medium text-risk-very-high"
    >
      <Icon name="warning" className="mt-0.5 size-[1.125rem] shrink-0" />
      <span>{t(error)}</span>
    </p>
  );
}

function ResendButton({
  sentAt,
  pending,
}: {
  sentAt: number | null;
  pending: boolean;
}) {
  const t = useTranslations("auth.code");
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const left =
    sentAt === null
      ? 0
      : Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000));
  return (
    <button type="submit" disabled={pending || left > 0} className={quiet}>
      {left > 0 ? t("resendIn", { seconds: left }) : t("resend")}
    </button>
  );
}
