// Kept out of actions.ts: a "use server" file may only export async functions.

/**
 * Length of the emailed code. Supabase decides it (hosted default 8, `otp_length` in
 * config.toml locally), so the app accepts a range instead of hardcoding one number.
 */
export const OTP_DIGITS = { min: 6, max: 8 } as const;

export type AuthError =
  "invalidEmail" | "invalidCode" | "rateLimited" | "sendFailed";

export type AuthState = {
  step: "email" | "code";
  email: string;
  error: AuthError | null;
  /** When the last code was requested (ms since epoch); drives the resend cooldown. */
  sentAt: number | null;
};

export const initialAuthState: AuthState = {
  step: "email",
  email: "",
  error: null,
  sentAt: null,
};
