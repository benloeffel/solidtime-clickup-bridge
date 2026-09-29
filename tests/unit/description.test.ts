import { describe, expect, it } from "vitest";
import { extractTaskId, formatDescription } from "../../src/core/description";

describe("formatDescription", () => {
  it("uses the Clockify-style format", () => {
    expect(formatDescription("Title of an awesome task", "86c1abcde")).toBe("Title of an awesome task | #86c1abcde");
  });

  it("collapses whitespace and strips a leading # from the id", () => {
    expect(formatDescription("  Fix\n  the   bug ", "#86c1abc")).toBe("Fix the bug | #86c1abc");
  });

  it("falls back to the id when the title is empty", () => {
    expect(formatDescription("   ", "86c1abc")).toBe("#86c1abc");
  });

  it("keeps custom task ids", () => {
    expect(formatDescription("Ship it", "DEV-42")).toBe("Ship it | #DEV-42");
  });
});

describe("extractTaskId", () => {
  it("round-trips formatDescription", () => {
    expect(extractTaskId(formatDescription("A | #weird title", "86c1abc"))).toBe("86c1abc");
  });

  it("reads a bare id description", () => {
    expect(extractTaskId("#86c1abc")).toBe("86c1abc");
  });

  it.each([null, undefined, "", "Meeting", "Title #86c1abc", "Title | 86c1abc"])("returns null for %j", (value) => {
    expect(extractTaskId(value)).toBeNull();
  });
});
