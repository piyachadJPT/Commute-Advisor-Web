"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LOCALE_COOKIE, locales } from "./config";

const schema = z.enum(locales);

/** Stores the chosen UI language. Persisted to settings.locale from Phase 2. */
export async function setLocale(formData: FormData): Promise<void> {
  const parsed = schema.safeParse(formData.get("locale"));
  if (!parsed.success) return;
  (await cookies()).set(LOCALE_COOKIE, parsed.data, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  revalidatePath("/", "layout");
}
