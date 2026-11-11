import { describe, expect, it } from "vitest";
import { isAllowedPushEndpoint } from "@/features/notifications/domain/pushEndpoint";
import { bearerMatches } from "@/lib/jobs/auth";

describe("isAllowedPushEndpoint (SSRF guard)", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc",
    "https://updates.push.services.mozilla.com/wpush/v2/abc",
    "https://web.push.apple.com/QWERTY",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
  ])("allows %s", (url) => expect(isAllowedPushEndpoint(url)).toBe(true));

  it.each([
    ["plain http", "http://fcm.googleapis.com/x"],
    ["an internal address", "https://169.254.169.254/latest/meta-data"],
    ["localhost", "https://localhost:3000/x"],
    ["a look-alike host", "https://fcm.googleapis.com.evil.example/x"],
    ["a suffix without a dot", "https://evilfcm.googleapis.com.evil.io/x"],
    ["credentials in the URL", "https://user:pw@fcm.googleapis.com/x"],
    ["a custom port", "https://fcm.googleapis.com:8443/x"],
    ["not a URL", "not a url"],
    ["empty", ""],
  ])("rejects %s", (_n, url) => expect(isAllowedPushEndpoint(url)).toBe(false));
});

describe("bearerMatches (job auth)", () => {
  const secret = "a".repeat(64);
  it("accepts only the exact bearer secret", () => {
    expect(bearerMatches(`Bearer ${secret}`, secret)).toBe(true);
    expect(bearerMatches(`Bearer ${secret}x`, secret)).toBe(false);
    expect(bearerMatches(`bearer ${secret}`, secret)).toBe(false);
    expect(bearerMatches(secret, secret)).toBe(false);
    expect(bearerMatches("", secret)).toBe(false);
    expect(bearerMatches(null, secret)).toBe(false);
  });
});
