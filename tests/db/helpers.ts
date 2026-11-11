import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";
import type { Database } from "@/lib/database.types";

export type Db = SupabaseClient<Database>;

export function stack() {
  const info = inject("stack");
  if (!info) throw new Error("Local Supabase stack is not running");
  return info;
}

const options = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/** Service-role client: bypasses RLS (jobs). Still bound by triggers and constraints. */
export function adminClient(): Db {
  const { apiUrl, secretKey } = stack();
  return createClient<Database>(apiUrl, secretKey, options);
}

/** Client with only the publishable key and no session: the `anon` role. */
export function anonClient(): Db {
  const { apiUrl, publishableKey } = stack();
  return createClient<Database>(apiUrl, publishableKey, options);
}

export type TestUser = { id: string; email: string; client: Db };

/** Creates a confirmed user (admin API works while public sign-up is disabled) and signs in. */
export async function createTestUser(): Promise<TestUser> {
  const admin = adminClient();
  const email = `test-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error || !created.data.user)
    throw created.error ?? new Error("no user");

  const client = anonClient();
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: created.data.user.id, email, client };
}

export async function deleteTestUser(user: TestUser): Promise<void> {
  await adminClient().auth.admin.deleteUser(user.id);
}

/** Postgres SQLSTATE codes surfaced by PostgREST. */
export const PG = {
  insufficientPrivilege: "42501", // permission denied / RLS violation
  checkViolation: "23514",
  uniqueViolation: "23505",
  invalidParameter: "22023",
} as const;

export const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString();
