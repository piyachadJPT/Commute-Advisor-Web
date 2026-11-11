"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { safeNext } from "@/lib/auth/safe-next";
import { createClient } from "@/lib/supabase/server";
import { initialAuthState, type AuthState } from "./state";

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
const codeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/);

const text = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value : "";

/**
 * One action for both steps of email-code sign-in (plan §14.3): `intent=request` emails a
 * 6-digit code, `intent=verify` checks it and starts the session.
 *
 * Public sign-up is disabled, so `shouldCreateUser: false`. An unknown address gets the same
 * "code sent" screen as a real one: the form must not reveal which emails have an account.
 */
export async function submitAuth(
  prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const intent = text(formData.get("intent"));

  // Back to the email step. The email field keeps what was typed (client state).
  if (intent === "change") return initialAuthState;

  const parsedEmail = emailSchema.safeParse(text(formData.get("email")));

  if (!parsedEmail.success) {
    // Hand back what was typed. With JS the controlled field already keeps it; this covers a
    // submit before hydration finishes, which is a plain form post that re-renders from state.
    return {
      ...prev,
      email: text(formData.get("email")).slice(0, 254),
      error: "invalidEmail",
    };
  }
  const email = parsedEmail.data;
  const supabase = await createClient();

  if (intent === "request") {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    if (error) {
      const sameScreen: Pick<AuthState, "step" | "email"> = {
        step: prev.step === "code" && prev.email === email ? "code" : "email",
        email,
      };
      if (error.status === 429)
        return { ...prev, ...sameScreen, error: "rateLimited" };
      if (error.status !== undefined && error.status >= 500) {
        return { ...prev, ...sameScreen, error: "sendFailed" };
      }
      // Any other rejection (unknown address, sign-up disabled) looks like success.
    }
    return { step: "code", email, error: null, sentAt: Date.now() };
  }

  if (intent === "verify") {
    const code = codeSchema.safeParse(text(formData.get("code")));
    if (!code.success)
      return { ...prev, step: "code", email, error: "invalidCode" };

    const { error } = await supabase.auth.verifyOtp({
      email,
      token: code.data,
      type: "email",
    });
    if (error) {
      return {
        ...prev,
        step: "code",
        email,
        error: error.status === 429 ? "rateLimited" : "invalidCode",
      };
    }
    // redirect() throws, so it stays outside any try/catch.
    redirect(safeNext(text(formData.get("next"))));
  }

  return prev;
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
