import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialAuthState, type AuthState } from "@/features/auth/state";

const signInWithOtp = vi.fn();
const verifyOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signInWithOtp, verifyOtp } }),
}));
// Like Next.js, redirect() throws; the test reads the target from the error.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const { submitAuth } = await import("@/features/auth/actions");

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};

const codeStep: AuthState = {
  step: "code",
  email: "owner@example.test",
  error: null,
  sentAt: 1,
};

beforeEach(() => {
  signInWithOtp.mockReset().mockResolvedValue({ error: null });
  verifyOtp.mockReset().mockResolvedValue({ error: null });
});

describe("submitAuth: request a code", () => {
  const request = (email: string, prev = initialAuthState) =>
    submitAuth(prev, form({ intent: "request", email }));

  it("sends a code for a valid email, normalised, without ever creating a user", async () => {
    const state = await request("  Owner@Example.TEST ");
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "owner@example.test",
      options: { shouldCreateUser: false },
    });
    expect(state).toMatchObject({
      step: "code",
      email: "owner@example.test",
      error: null,
    });
    expect(state.sentAt).toEqual(expect.any(Number));
  });

  it.each(["", "not-an-email", "a@b", "x".repeat(300) + "@example.test"])(
    "rejects %j without calling Supabase",
    async (bad) => {
      const state = await request(bad);
      expect(state.error).toBe("invalidEmail");
      expect(state.step).toBe("email");
      expect(signInWithOtp).not.toHaveBeenCalled();
    },
  );

  it("shows the same code screen for an unknown address (no account enumeration)", async () => {
    signInWithOtp.mockResolvedValue({
      error: { status: 400, code: "otp_disabled" },
    });
    const state = await request("nobody@example.test");
    expect(state).toMatchObject({
      step: "code",
      email: "nobody@example.test",
      error: null,
    });
  });

  it("reports rate limiting, staying on the current step", async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 429 } });
    expect(await request("owner@example.test")).toMatchObject({
      step: "email",
      error: "rateLimited",
    });
    expect(await request("owner@example.test", codeStep)).toMatchObject({
      step: "code",
      error: "rateLimited",
    });
  });

  it("reports a send failure on a server error", async () => {
    signInWithOtp.mockResolvedValue({ error: { status: 500 } });
    expect(await request("owner@example.test")).toMatchObject({
      error: "sendFailed",
    });
  });
});

describe("submitAuth: verify the code", () => {
  const verify = (fields: Record<string, string>) =>
    submitAuth(
      codeStep,
      form({ intent: "verify", email: "owner@example.test", ...fields }),
    );

  it("starts the session and redirects to a safe next path", async () => {
    await expect(verify({ code: "123456", next: "/weather" })).rejects.toThrow(
      "REDIRECT:/weather",
    );
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "owner@example.test",
      token: "123456",
      type: "email",
    });
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/.//evil.example",
    "javascript:1",
    "",
  ])("never redirects to %j", async (next) => {
    await expect(verify({ code: "123456", next })).rejects.toThrow(
      "REDIRECT:/",
    );
  });

  it.each(["123456", "1234567", "12345678"])(
    "accepts a %s-digit code (Supabase decides the length; hosted projects send 8)",
    async (code) => {
      await expect(verify({ code })).rejects.toThrow("REDIRECT:/");
      expect(verifyOtp).toHaveBeenCalledWith({
        email: "owner@example.test",
        token: code,
        type: "email",
      });
    },
  );

  it.each(["", "12345", "123456789", "12345a", "123 456", "١٢٣٤٥٦"])(
    "rejects the malformed code %j without calling Supabase",
    async (code) => {
      const state = await verify({ code });
      expect(state).toMatchObject({ step: "code", error: "invalidCode" });
      expect(verifyOtp).not.toHaveBeenCalled();
    },
  );

  it("reports a wrong or expired code and stays on the code step", async () => {
    verifyOtp.mockResolvedValue({
      error: { status: 403, code: "otp_expired" },
    });
    expect(await verify({ code: "000000" })).toMatchObject({
      step: "code",
      error: "invalidCode",
    });
  });

  it("reports rate limiting on verification", async () => {
    verifyOtp.mockResolvedValue({ error: { status: 429 } });
    expect(await verify({ code: "000000" })).toMatchObject({
      step: "code",
      error: "rateLimited",
    });
  });
});

describe("submitAuth: other intents", () => {
  it("returns to the email step", async () => {
    expect(await submitAuth(codeStep, form({ intent: "change" }))).toEqual(
      initialAuthState,
    );
  });

  it("ignores an unknown intent", async () => {
    const state = await submitAuth(
      codeStep,
      form({ intent: "hack", email: "owner@example.test" }),
    );
    expect(state).toEqual(codeStep);
    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
