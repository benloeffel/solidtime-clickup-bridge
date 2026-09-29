import { extractTaskId, formatDescription } from "./description";
import {
  resolveProject,
  type NamedProject,
  type ProjectMapping,
  type ProjectResolution,
  type TaskLocation,
} from "./projectResolver";
import { SolidtimeApiError, type SolidtimeClient, type TimeEntry } from "./solidtime";
import { sharesTaskId } from "./taskId";

export interface ClickUpTask {
  /** The id shown to the user (custom id when enabled); used in the description. */
  id: string;
  /** Other ids of the same task, e.g. the native id when `id` is a custom id. */
  aliases?: string[];
  title: string;
  location?: TaskLocation;
}

export interface TrackingSettings {
  organizationId: string;
  memberId: string;
  billable: boolean;
  mapping: ProjectMapping;
  /** Projects for name-based matching; empty when automatic matching is off. */
  autoMatchProjects: readonly NamedProject[];
}

export type TimerClient = Pick<SolidtimeClient, "getActiveTimeEntry" | "startTimeEntry" | "stopTimeEntry">;

/** Ids known for a running entry beyond the one in its description (e.g. remembered aliases). */
export type KnownTaskIds = (entry: TimeEntry) => readonly string[];

export type ToggleResult =
  | { action: "started"; active: TimeEntry; project: ProjectResolution }
  | { action: "switched"; active: TimeEntry; stopped: TimeEntry; project: ProjectResolution }
  | { action: "stopped"; active: null; stopped: TimeEntry };

export const taskIds = (task: ClickUpTask): string[] => [task.id, ...(task.aliases ?? [])];

/** All ClickUp ids that identify the task a running entry belongs to. */
export function entryTaskIds(entry: TimeEntry, knownIds: KnownTaskIds = () => []): string[] {
  const fromDescription = extractTaskId(entry.description);
  return [...(fromDescription ? [fromDescription] : []), ...knownIds(entry)];
}

/**
 * Click on a task's button:
 * - the task is already being tracked → stop it
 * - another entry is running → stop it, start this task
 * - nothing running → start this task
 */
export async function toggleTask(
  client: TimerClient,
  task: ClickUpTask,
  settings: TrackingSettings,
  knownIds?: KnownTaskIds,
): Promise<ToggleResult> {
  const running = await client.getActiveTimeEntry();

  if (running && sharesTaskId(entryTaskIds(running, knownIds), taskIds(task))) {
    const stopped = await client.stopTimeEntry(running);
    return { action: "stopped", active: null, stopped };
  }

  const stopped = running ? await client.stopTimeEntry(running) : null;
  const project = resolveProject(task.location ?? {}, settings.mapping, settings.autoMatchProjects);
  const active = await startWithRetry(client, task, settings, project.projectId);

  return stopped ? { action: "switched", active, stopped, project } : { action: "started", active, project };
}

async function startWithRetry(
  client: TimerClient,
  task: ClickUpTask,
  settings: TrackingSettings,
  projectId: string | null,
): Promise<TimeEntry> {
  const entry = {
    memberId: settings.memberId,
    description: formatDescription(task.title, task.id),
    projectId,
    billable: settings.billable,
  };

  try {
    return await client.startTimeEntry(settings.organizationId, entry);
  } catch (error) {
    // Another client (desktop app, web) started a timer between our check and start.
    if (error instanceof SolidtimeApiError && error.key === "time_entry_still_running") {
      const running = await client.getActiveTimeEntry();
      if (running) await client.stopTimeEntry(running);
      return await client.startTimeEntry(settings.organizationId, entry);
    }
    throw error;
  }
}
