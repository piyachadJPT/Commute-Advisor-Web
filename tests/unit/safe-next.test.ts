import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/auth/safe-next";

describe("safeNext (open-redirect guard)", () => {
  it.each([
    ["/", "/"],
    ["/weather", "/weather"],
    ["/history/2026-11-11", "/history/2026-11-11"],
    ["/settings?tab=notifications", "/settings?tab=notifications"],
  ])("keeps the same-origin path %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty", ""],
    ["relative path", "weather"],
    ["absolute URL", "https://evil.example/phish"],
    ["protocol-relative", "//evil.example"],
    ["slash-backslash", "/\\evil.example"],
    ["backslash", "\\\\evil.example"],
    ["javascript scheme", "javascript:alert(1)"],
    ["data scheme", "data:text/html,x"],
    ["dot segment that normalises to //", "/.//evil.example"],
    ["dot-dot segment that normalises to //", "/a/..//evil.example"],
    ["tab inside", "/\t/evil.example"],
    ["newline", "/\nSet-Cookie: a=b"],
    ["NUL", "/\u0000"],
    ["login page itself", "/login"],
    ["login with query", "/login?next=/"],
    ["too long", `/${"a".repeat(3000)}`],
  ])("falls back to / for %s", (_name, input) => {
    expect(safeNext(input)).toBe("/");
  });

  it("uses a custom fallback", () => {
    expect(safeNext("https://evil.example", "/weather")).toBe("/weather");
  });
});
