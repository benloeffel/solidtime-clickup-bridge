import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { SolidtimeApiError, SolidtimeClient, toSolidtimeDate } from "../../src/core/solidtime";
import { FAKE_MEMBER_ID, FAKE_ORG_ID, FAKE_TOKEN, FakeSolidtime } from "../support/fakeSolidtime";

const fake = new FakeSolidtime();
let baseUrl = "";
let client: SolidtimeClient;

beforeAll(async () => {
  baseUrl = await fake.listen();
  client = new SolidtimeClient({ baseUrl: `${baseUrl}/`, token: FAKE_TOKEN });
});
afterAll(() => fake.close());
beforeEach(() => fake.reset());

describe("toSolidtimeDate", () => {
  it("drops milliseconds", () => {
    expect(toSolidtimeDate(new Date("2026-09-29T10:11:12.345Z"))).toBe("2026-09-29T10:11:12Z");
  });
});

describe("SolidtimeClient", () => {
  it("lists memberships", async () => {
    const memberships = await client.getMemberships();
    expect(memberships).toEqual([
      expect.objectContaining({ id: FAKE_MEMBER_ID, organization: expect.objectContaining({ id: FAKE_ORG_ID }) }),
    ]);
  });

  it("returns null when no timer is running", async () => {
    expect(await client.getActiveTimeEntry()).toBeNull();
  });

  it("starts and stops a time entry", async () => {
    const started = await client.startTimeEntry(FAKE_ORG_ID, {
      memberId: FAKE_MEMBER_ID,
      description: "Task | #abc",
      projectId: "proj-eng",
      billable: true,
    });
    expect(started).toMatchObject({ description: "Task | #abc", project_id: "proj-eng", billable: true, end: null });
    expect((await client.getActiveTimeEntry())?.id).toBe(started.id);

    const stopped = await client.stopTimeEntry(started);
    expect(stopped.end).not.toBeNull();
    expect(await client.getActiveTimeEntry()).toBeNull();
  });

  it("surfaces the API error key", async () => {
    const entry = { memberId: FAKE_MEMBER_ID, description: "x", projectId: null, billable: false };
    await client.startTimeEntry(FAKE_ORG_ID, entry);
    const error = await client.startTimeEntry(FAKE_ORG_ID, entry).catch((e) => e);
    expect(error).toBeInstanceOf(SolidtimeApiError);
    expect(error.key).toBe("time_entry_still_running");
  });

  it("explains a rejected token", async () => {
    const bad = new SolidtimeClient({ baseUrl, token: "nope" });
    await expect(bad.getMemberships()).rejects.toMatchObject({
      status: 401,
      message: expect.stringMatching(/API token/),
    });
  });

  it("reports unreachable instances", async () => {
    const offline = new SolidtimeClient({ baseUrl: "http://127.0.0.1:1", token: FAKE_TOKEN });
    await expect(offline.getMemberships()).rejects.toMatchObject({ status: 0, key: "network_error" });
  });

  it("never follows redirects, so the token can't be forwarded elsewhere", async () => {
    const attacker = new FakeSolidtime();
    const attackerUrl = await attacker.listen();
    try {
      fake.redirectTo = `${attackerUrl}/api/v1/users/me/memberships`;
      await expect(client.getMemberships()).rejects.toMatchObject({ status: 0, key: "network_error" });
      expect(attacker.requests).toHaveLength(0);
    } finally {
      await attacker.close();
    }
  });

  it("lists projects", async () => {
    const projects = await client.getProjects(FAKE_ORG_ID);
    expect(projects.map((p) => p.name)).toEqual(["Engineering", "Client Work", "example.com", "northwind.de"]);
  });
});
