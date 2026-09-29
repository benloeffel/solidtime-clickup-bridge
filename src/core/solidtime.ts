/**
 * Minimal Solidtime REST client covering exactly what the extension needs.
 * API reference: https://docs.solidtime.io/api-reference
 */

export interface TimeEntry {
  id: string;
  start: string;
  end: string | null;
  description: string | null;
  project_id: string | null;
  task_id: string | null;
  organization_id: string;
  user_id: string;
  tags: string[];
  billable: boolean;
}

export interface Membership {
  /** Membership id; this is the `member_id` used when creating time entries. */
  id: string;
  organization: { id: string; name: string };
  role: string;
}

export interface Project {
  id: string;
  name: string;
  color: string;
  is_archived?: boolean;
}

export interface NewTimeEntry {
  memberId: string;
  description: string;
  projectId: string | null;
  billable: boolean;
}

export class SolidtimeApiError extends Error {
  constructor(
    readonly status: number,
    readonly key: string | null,
    message: string,
  ) {
    super(message);
    this.name = "SolidtimeApiError";
  }
}

/** Solidtime only accepts `Y-m-d\TH:i:s\Z` (no milliseconds). */
export function toSolidtimeDate(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

const REQUEST_TIMEOUT_MS = 15_000;

export interface SolidtimeClientOptions {
  baseUrl: string;
  token: string;
  fetch?: typeof fetch;
}

export class SolidtimeClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SolidtimeClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token.trim();
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async getMemberships(): Promise<Membership[]> {
    const body = await this.request<{ data: Membership[] }>("GET", "/users/me/memberships");
    return body.data;
  }

  /** Returns the running time entry, or null when nothing is running. */
  async getActiveTimeEntry(): Promise<TimeEntry | null> {
    try {
      const body = await this.request<{ data: TimeEntry }>("GET", "/users/me/time-entries/active");
      return body.data;
    } catch (error) {
      if (error instanceof SolidtimeApiError && error.status === 404) return null;
      throw error;
    }
  }

  async startTimeEntry(organizationId: string, entry: NewTimeEntry): Promise<TimeEntry> {
    const body = await this.request<{ data: TimeEntry }>(
      "POST",
      `/organizations/${encodeURIComponent(organizationId)}/time-entries`,
      {
        member_id: entry.memberId,
        description: entry.description,
        project_id: entry.projectId,
        billable: entry.billable,
        start: toSolidtimeDate(new Date()),
        end: null,
        tags: [],
      },
    );
    return body.data;
  }

  async stopTimeEntry(entry: TimeEntry, end: Date = new Date()): Promise<TimeEntry> {
    const body = await this.request<{ data: TimeEntry }>(
      "PUT",
      `/organizations/${encodeURIComponent(entry.organization_id)}/time-entries/${encodeURIComponent(entry.id)}`,
      { end: toSolidtimeDate(end) },
    );
    return body.data;
  }

  /** All non-archived projects of an organization (follows pagination). */
  async getProjects(organizationId: string): Promise<Project[]> {
    const projects: Project[] = [];
    for (let page = 1; page < 100; page++) {
      const body = await this.request<{ data: Project[]; meta?: { last_page?: number } }>(
        "GET",
        `/organizations/${encodeURIComponent(organizationId)}/projects?archived=false&page=${page}`,
      );
      projects.push(...body.data);
      const lastPage = body.meta?.last_page ?? 1;
      if (page >= lastPage || body.data.length === 0) break;
    }
    return projects;
  }

  private async request<T>(method: string, path: string, json?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/v1${path}`, {
        method,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          ...(json === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: json === undefined ? undefined : JSON.stringify(json),
        // Never follow redirects: the bearer token must only go to the configured instance.
        redirect: "error",
        credentials: "omit",
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new SolidtimeApiError(
        0,
        "network_error",
        `Cannot reach Solidtime at ${this.baseUrl} (offline, timed out, or it redirected).`,
      );
    }

    if (!response.ok) {
      let key: string | null = null;
      let message = `Solidtime responded with HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { key?: string; message?: string };
        key = body.key ?? null;
        if (body.message) message = body.message;
      } catch {
        // Non-JSON error body; keep the generic message.
      }
      if (response.status === 401) message = "Solidtime rejected the API token. Check the extension options.";
      throw new SolidtimeApiError(response.status, key, message);
    }

    return (await response.json()) as T;
  }
}
