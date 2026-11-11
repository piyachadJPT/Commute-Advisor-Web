import { execFileSync } from "node:child_process";
import type { TestProject } from "vitest/node";

export type StackInfo = {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
};

declare module "vitest" {
  export interface ProvidedContext {
    stack: StackInfo | null;
  }
}

/**
 * Reads the local Supabase stack's URL and keys from `supabase status`, so no key is ever
 * written to the repo. If the stack is not running, DB tests are skipped with a clear message
 * instead of failing the whole run (pure unit tests still run).
 */
export default function setup(project: TestProject) {
  try {
    const out = execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const json = JSON.parse(out.slice(out.indexOf("{"))) as Record<
      string,
      string
    >;
    const { API_URL, PUBLISHABLE_KEY, SECRET_KEY } = json;
    if (!API_URL || !PUBLISHABLE_KEY || !SECRET_KEY)
      throw new Error("incomplete status output");
    project.provide("stack", {
      apiUrl: API_URL,
      publishableKey: PUBLISHABLE_KEY,
      secretKey: SECRET_KEY,
    });
  } catch {
    console.warn(
      "\n[db tests] Local Supabase stack not reachable. Run `supabase start`; DB tests are skipped.\n",
    );
    project.provide("stack", null);
  }
}
