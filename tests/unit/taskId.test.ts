import { describe, expect, it } from "vitest";
import { findTaskIdInText, isValidTaskId, sameTaskId, sharesTaskId, uniqueTaskIds } from "../../src/core/taskId";
import { collapseWhitespace, truncate } from "../../src/core/text";

describe("task ids", () => {
  it("finds the id in a label", () => {
    expect(findTaskIdInText("#DEV-42")).toBe("DEV-42");
    expect(findTaskIdInText("  86c1abcde ")).toBe("86c1abcde");
    expect(findTaskIdInText("")).toBeNull();
    expect(findTaskIdInText(null)).toBeNull();
  });

  it("compares case-insensitively and ignores a leading #", () => {
    expect(sameTaskId("#dev-42", "DEV-42")).toBe(true);
    expect(sameTaskId("DEV-4", "DEV-42")).toBe(false);
    expect(sameTaskId(null, "x")).toBe(false);
  });

  it("detects a shared id between two id sets", () => {
    expect(sharesTaskId(["MKT-42", "86c1abc"], ["86C1ABC"])).toBe(true);
    expect(sharesTaskId(["MKT-42"], ["86c1abc"])).toBe(false);
    expect(sharesTaskId([], ["86c1abc"])).toBe(false);
  });

  it("dedupes and drops invalid ids", () => {
    expect(uniqueTaskIds(["MKT-42", null, "mkt-42", "86c1abc", "<x>", undefined])).toEqual(["MKT-42", "86c1abc"]);
    expect(isValidTaskId("a".repeat(64))).toBe(true);
    expect(isValidTaskId("a".repeat(65))).toBe(false);
  });
});

describe("text helpers", () => {
  it("collapses whitespace", () => expect(collapseWhitespace("  a \n\t b  ")).toBe("a b"));
  it("truncates with an ellipsis", () => {
    expect(truncate("abcdef", 4)).toBe("abc…");
    expect(truncate("abc", 4)).toBe("abc");
  });
});
