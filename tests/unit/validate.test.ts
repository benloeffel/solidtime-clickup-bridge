import { describe, expect, it } from "vitest";
import { isValidTaskId } from "../../src/core/taskId";
import { InstanceUrlError, MAX_TITLE_LENGTH, parseInstanceUrl, sanitizeTask } from "../../src/core/validate";

describe("parseInstanceUrl", () => {
  it.each([
    ["https://time.example.com", "https://time.example.com"],
    ["  https://time.example.com/  ", "https://time.example.com"],
    ["https://example.com/solidtime/", "https://example.com/solidtime"],
    ["https://time.example.com:8443", "https://time.example.com:8443"],
    ["http://localhost:8000", "http://localhost:8000"],
    ["http://127.0.0.1:8000", "http://127.0.0.1:8000"],
  ])("accepts %s", (input, expected) => {
    expect(parseInstanceUrl(input)).toBe(expected);
  });

  it.each([
    ["http://time.example.com", /https/],
    ["http://192.168.1.10", /https/],
    ["javascript:alert(1)", /https/],
    ["file:///etc/passwd", /https/],
    ["ftp://time.example.com", /https/],
    ["https://user:pass@time.example.com", /username/],
    ["https://time.example.com/?x=1", /query/],
    ["https://time.example.com/#frag", /query/],
    ["time.example.com", /full URL/],
    ["", /full URL/],
  ])("rejects %s", (input, message) => {
    expect(() => parseInstanceUrl(input)).toThrow(InstanceUrlError);
    expect(() => parseInstanceUrl(input)).toThrow(message);
  });
});

describe("isValidTaskId", () => {
  it.each(["86c1abcde", "DEV-42", "abc_123"])("accepts %s", (id) => expect(isValidTaskId(id)).toBe(true));
  it.each(["", "-x", "a b", "a/b", "<img>", "x".repeat(65), 42, null, undefined, {}])("rejects %j", (id) =>
    expect(isValidTaskId(id)).toBe(false),
  );
});

describe("sanitizeTask", () => {
  it("keeps a normal task", () => {
    expect(sanitizeTask({ id: "86c1a", title: "Fix bug", location: { space: "Eng", list: "Backlog" } })).toEqual({
      id: "86c1a",
      title: "Fix bug",
      location: { space: "Eng", list: "Backlog" },
    });
  });

  it("strips control and bidi-override characters", () => {
    expect(sanitizeTask({ id: "a1", title: "Fix\u0000 bug‮\n\ttoday" })?.title).toBe("Fix bug today");
  });

  it("caps very long titles", () => {
    const title = sanitizeTask({ id: "a1", title: "x".repeat(10_000) })!.title;
    expect(title).toHaveLength(MAX_TITLE_LENGTH);
    expect(title.endsWith("…")).toBe(true);
  });

  it("keeps valid, distinct aliases and drops the rest", () => {
    expect(
      sanitizeTask({ id: "MKT-42", title: "t", aliases: ["86c1abc", "mkt-42", "<bad>", 7, "86C1ABC"] })?.aliases,
    ).toEqual(["86c1abc"]);
    expect(sanitizeTask({ id: "a1", title: "t", aliases: "86c1abc" })).not.toHaveProperty("aliases");
  });

  it("drops non-string location parts", () => {
    expect(sanitizeTask({ id: "a1", title: "t", location: { space: { evil: 1 }, list: 5 } })?.location).toEqual({
      space: null,
      list: null,
    });
  });

  it.each([
    null,
    "str",
    {},
    { id: "a1" },
    { id: "a1", title: "   " },
    { id: "../x", title: "t" },
    { id: "a1", title: 5 },
  ])("rejects %j", (input) => expect(sanitizeTask(input)).toBeNull());
});
