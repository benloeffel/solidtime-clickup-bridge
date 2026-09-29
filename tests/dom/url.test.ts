import { describe, expect, it } from "vitest";
import { parseTaskUrl } from "../../src/clickup/url";

describe("parseTaskUrl", () => {
  it.each([
    ["https://app.clickup.com/t/86c1abcde", "86c1abcde"],
    ["https://app.clickup.com/t/86c1abcde?comment=1", "86c1abcde"],
    ["/t/86c1abcde", "86c1abcde"],
    ["https://app.clickup.com/t/9012345/DEV-42", "DEV-42"],
    ["https://app.clickup.com/9012345/t/86c1abcde", "86c1abcde"],
  ])("parses %s", (href, expected) => {
    expect(parseTaskUrl(href)).toEqual(expected);
  });

  it.each([
    null,
    "",
    "https://app.clickup.com/9012345/v/li/901",
    "https://example.com/t/86c1abcde",
    "https://app.clickup.com/t/",
  ])("rejects %j", (href) => {
    expect(parseTaskUrl(href)).toBeNull();
  });
});
