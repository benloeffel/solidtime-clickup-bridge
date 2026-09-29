import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SolidtimeClient } from "../../src/core/solidtime";
import { toggleTask, type TrackingSettings } from "../../src/core/timerToggle";
import { FAKE_MEMBER_ID, FAKE_ORG_ID, FAKE_TOKEN, FakeSolidtime } from "../support/fakeSolidtime";

const fake = new FakeSolidtime();
let client: SolidtimeClient;

const settings: TrackingSettings = {
  organizationId: FAKE_ORG_ID,
  memberId: FAKE_MEMBER_ID,
  billable: false,
  mapping: { lists: { Backlog: "proj-client" }, spaces: { Engineering: "proj-eng" }, defaultProjectId: null },
  autoMatchProjects: [],
};

const taskA = { id: "86aaa", title: "Task A", location: { space: "Engineering", list: "Backlog" } };
const taskB = { id: "86bbb", title: "Task B", location: { space: "Engineering", list: "Sprint" } };

beforeAll(async () => {
  client = new SolidtimeClient({ baseUrl: await fake.listen(), token: FAKE_TOKEN });
});
afterAll(() => fake.close());
beforeEach(() => fake.reset());

describe("toggleTask", () => {
  it("starts a timer with the formatted description and mapped project", async () => {
    const result = await toggleTask(client, taskA, settings);
    expect(result.action).toBe("started");
    expect(fake.running).toMatchObject({ description: "Task A | #86aaa", project_id: "proj-client" });
  });

  it("stops the timer when the same task is clicked again", async () => {
    await toggleTask(client, taskA, settings);
    const result = await toggleTask(client, taskA, settings);
    expect(result.action).toBe("stopped");
    expect(fake.running).toBeUndefined();
  });

  it("switches from another task", async () => {
    await toggleTask(client, taskA, settings);
    const result = await toggleTask(client, taskB, settings);
    expect(result).toMatchObject({ action: "switched", stopped: { description: "Task A | #86aaa" } });
    expect(fake.running).toMatchObject({ description: "Task B | #86bbb", project_id: "proj-eng" });
    expect(fake.entries.filter((e) => e.end === null)).toHaveLength(1);
  });

  it("stops a timer started outside ClickUp before starting", async () => {
    fake.entries.push({
      id: "external",
      start: "2026-09-29T08:00:00Z",
      end: null,
      description: "Email",
      project_id: null,
      task_id: null,
      organization_id: FAKE_ORG_ID,
      user_id: "user-1",
      tags: [],
      billable: false,
    });
    const result = await toggleTask(client, taskA, settings);
    expect(result.action).toBe("switched");
    expect(fake.entries.find((e) => e.id === "external")?.end).not.toBeNull();
  });

  it("recovers when another client starts a timer mid-toggle", async () => {
    const racy = Object.create(client) as SolidtimeClient;
    let first = true;
    racy.getActiveTimeEntry = vi.fn(async () => {
      if (first) {
        first = false;
        // Nothing running when we check, but the desktop app starts one right after.
        await client.startTimeEntry(FAKE_ORG_ID, {
          memberId: FAKE_MEMBER_ID,
          description: "Desktop",
          projectId: null,
          billable: false,
        });
        return null;
      }
      return client.getActiveTimeEntry();
    });
    const result = await toggleTask(racy, taskA, settings);
    expect(result.action).toBe("started");
    expect(fake.running?.description).toBe("Task A | #86aaa");
    expect(fake.entries.filter((e) => e.end === null)).toHaveLength(1);
  });

  it("stops instead of duplicating when the running entry is known under another id of the task", async () => {
    // Started from the task view, which shows the custom id; the row only knows the native id.
    const detail = { id: "MKT-42", aliases: ["86c1native"], title: "Launch", location: {} };
    const started = await toggleTask(client, detail, settings);
    expect(started.action).toBe("started");
    const remembered = (entry: { id: string }) => (entry.id === started.active!.id ? ["MKT-42", "86c1native"] : []);

    const row = { id: "86c1native", title: "Launch", location: {} };
    const result = await toggleTask(client, row, settings, remembered);
    expect(result.action).toBe("stopped");
    expect(fake.entries).toHaveLength(1);
  });

  it("recognises a native-id entry from the task view via its aliases", async () => {
    await toggleTask(client, { id: "86c1native", title: "Launch", location: {} }, settings);
    const result = await toggleTask(
      client,
      { id: "MKT-42", aliases: ["86c1native"], title: "Launch", location: {} },
      settings,
    );
    expect(result.action).toBe("stopped");
  });

  it("reports which rule chose the project", async () => {
    const result = await toggleTask(client, taskA, settings);
    expect(result).toMatchObject({ action: "started", project: { source: "list-mapping", projectId: "proj-client" } });
  });

  it("propagates other API errors", async () => {
    await expect(toggleTask(client, taskA, { ...settings, memberId: "wrong" })).rejects.toThrow(/member_id/);
  });
});
