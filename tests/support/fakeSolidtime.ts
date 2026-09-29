/**
 * In-memory stand-in for the parts of the Solidtime API the extension uses.
 * Mirrors the real rules that matter: bearer auth, 404 for "no active entry",
 * one running entry per member, and the seconds-only date format.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const FAKE_TOKEN = "test-token";
export const FAKE_ORG_ID = "org-1";
export const FAKE_MEMBER_ID = "member-1";
export const FAKE_USER_ID = "user-1";

const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export interface FakeEntry {
  id: string;
  start: string;
  end: string | null;
  description: string | null;
  project_id: string | null;
  task_id: null;
  organization_id: string;
  user_id: string;
  tags: string[];
  billable: boolean;
}

export interface RecordedRequest {
  method: string;
  path: string;
  body: unknown;
}

export class FakeSolidtime {
  entries: FakeEntry[] = [];
  requests: RecordedRequest[] = [];
  projects = [
    { id: "proj-eng", name: "Engineering", color: "#2196f3", is_archived: false },
    { id: "proj-client", name: "Client Work", color: "#4caf50", is_archived: false },
    { id: "proj-domain", name: "example.com", color: "#ff9800", is_archived: false },
    { id: "proj-northwind", name: "northwind.de", color: "#9c27b0", is_archived: false },
  ];
  /** When set, every API request is answered with a redirect to this URL. */
  redirectTo: string | null = null;
  /** Base URL once listening, e.g. http://127.0.0.1:43123 */
  url = "";
  private server: Server | null = null;
  private nextId = 1;

  get running(): FakeEntry | undefined {
    return this.entries.find((entry) => entry.end === null);
  }

  reset(): void {
    this.redirectTo = null;
    this.entries = [];
    this.requests = [];
  }

  async listen(port = 0): Promise<string> {
    this.server = createServer((req, res) => void this.handle(req, res));
    await new Promise<void>((resolve) => this.server!.listen(port, "127.0.0.1", resolve));
    const address = this.server.address() as AddressInfo;
    this.url = `http://127.0.0.1:${address.port}`;
    return this.url;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://fake");
    const path = url.pathname;
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : undefined;

    // Test-only control endpoints (not part of the real API).
    // Stand-in for Solidtime's web app: a window.onfocus handler (AppLayout.vue) and a
    // Vue app on #app providing vue-query's client, as in the real Solidtime frontend.
    if (path === "/app") {
      res.writeHead(200, { "Content-Type": "text/html" });
      return void res.end(`<!doctype html><title>Solidtime</title>
<div id="app"><p id="refreshes">0</p><p id="invalidated"></p></div>
<script>
  const bump = (id) => { const el = document.getElementById(id); el.textContent = String(Number(el.textContent) + 1); };
  window.onfocus = () => bump("refreshes");
  document.getElementById("app").__vue_app__ = { _context: { provides: { VUE_QUERY_CLIENT: {
    invalidateQueries: (filters) => { document.getElementById("invalidated").textContent += JSON.stringify(filters.queryKey) + ";"; },
  } } } };
</script>`);
    }
    if (path === "/__test/stop-running" && req.method === "POST") {
      const running = this.running;
      if (running) running.end = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      return send(res, 200, {});
    }
    if (path === "/__test/state") return send(res, 200, { entries: this.entries, requests: this.requests });
    if (path === "/__test/reset") {
      this.reset();
      return send(res, 200, {});
    }
    if (path === "/__test/start-external" && req.method === "POST") {
      this.create({ description: body?.description ?? "Started elsewhere", project_id: null, billable: false });
      return send(res, 200, {});
    }

    this.requests.push({ method: req.method ?? "GET", path: path + url.search, body });

    if (this.redirectTo) {
      res.writeHead(302, { Location: this.redirectTo });
      return void res.end();
    }

    if (req.headers.authorization !== `Bearer ${FAKE_TOKEN}`) {
      return send(res, 401, { message: "Unauthenticated." });
    }

    if (req.method === "GET" && path === "/api/v1/users/me/memberships") {
      return send(res, 200, {
        data: [{ id: FAKE_MEMBER_ID, organization: { id: FAKE_ORG_ID, name: "Acme", currency: "EUR" }, role: "owner" }],
      });
    }

    if (req.method === "GET" && path === "/api/v1/users/me/time-entries/active") {
      const running = this.running;
      return running ? send(res, 200, { data: running }) : send(res, 404, { message: "No active time entry" });
    }

    if (req.method === "GET" && path === `/api/v1/organizations/${FAKE_ORG_ID}/projects`) {
      return send(res, 200, { data: this.projects, meta: { current_page: 1, last_page: 1 } });
    }

    if (req.method === "POST" && path === `/api/v1/organizations/${FAKE_ORG_ID}/time-entries`) {
      if (body?.member_id !== FAKE_MEMBER_ID) return send(res, 422, { message: "Invalid member_id" });
      if (!DATE_FORMAT.test(body?.start ?? "")) return send(res, 422, { message: "Invalid start format" });
      if (body.end === null && this.running) {
        return send(res, 400, { error: true, key: "time_entry_still_running", message: "Time entry is still running" });
      }
      const entry = this.create(body);
      return send(res, 201, { data: entry });
    }

    const update = path.match(new RegExp(`^/api/v1/organizations/${FAKE_ORG_ID}/time-entries/([^/]+)$`));
    if (req.method === "PUT" && update) {
      const entry = this.entries.find((candidate) => candidate.id === update[1]);
      if (!entry) return send(res, 404, { message: "Not found" });
      if (body?.end !== undefined) {
        if (body.end !== null && !DATE_FORMAT.test(body.end)) return send(res, 422, { message: "Invalid end format" });
        entry.end = body.end;
      }
      return send(res, 200, { data: entry });
    }

    return send(res, 404, { message: `No fake route for ${req.method} ${path}` });
  }

  private create(body: {
    description: string | null;
    project_id: string | null;
    billable: boolean;
    start?: string;
  }): FakeEntry {
    const entry: FakeEntry = {
      id: `entry-${this.nextId++}`,
      start: body.start ?? new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
      end: null,
      description: body.description,
      project_id: body.project_id,
      task_id: null,
      organization_id: FAKE_ORG_ID,
      user_id: FAKE_USER_ID,
      tags: [],
      billable: body.billable,
    };
    this.entries.push(entry);
    return entry;
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Allow-Methods": "*",
  });
  res.end(JSON.stringify(payload));
}
