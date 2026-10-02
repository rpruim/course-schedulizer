import { upgradeSchedule, type Schedule } from "@schedulizer/core";

/**
 * Where the user's work lives. v1 is browser storage; a hosted service would
 * implement the same interface (spec §9, §10 H2–H5) without touching the core or
 * the views. The unit is the whole **workspace**: the schedules that are open,
 * which one is current, and which are included in the views.
 */
export interface WorkspaceEntry {
  id: string;
  name: string;
  schedule: Schedule;
}

export interface WorkspaceSnapshot {
  entries: WorkspaceEntry[];
  /** The schedule that Add, Re-letter and Export act on. */
  currentId: string;
  /** Schedules shown in the views, in the order of `entries`. */
  included: string[];
}

export interface StoredWorkspace extends WorkspaceSnapshot {
  version: number;
  savedAt: string;
}

/** `save` was given a `baseVersion` that is no longer the stored version (someone else saved). */
export class VersionConflictError extends Error {
  constructor(
    readonly stored: number,
    readonly base: number,
  ) {
    super(`stored version is ${stored}, but the save was based on ${base}`);
    this.name = "VersionConflictError";
  }
}

export interface WorkspaceStore {
  load(): Promise<StoredWorkspace | undefined>;
  /** Saves and returns the new record (version + 1). Throws `VersionConflictError` if `baseVersion` is stale. */
  save(snapshot: WorkspaceSnapshot, baseVersion?: number): Promise<StoredWorkspace>;
  clear(): Promise<void>;
}

type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const WORKSPACE_KEY = "schedulizer:workspace";
/** The single-schedule record written by earlier versions of the app. */
const LEGACY_KEY = "schedulizer:current";

/** Browser-storage implementation (`localStorage` by default; anything Storage-shaped works). */
export class LocalWorkspaceStore implements WorkspaceStore {
  constructor(
    private readonly storage: KeyValue,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => `s${Math.random().toString(36).slice(2, 10)}`,
  ) {}

  private parse<T>(key: string): T | undefined {
    const text = this.storage.getItem(key);
    if (!text) return undefined;
    try {
      return JSON.parse(text) as T;
    } catch {
      return undefined; // a corrupt record is treated as absent rather than breaking the app
    }
  }

  async load(): Promise<StoredWorkspace | undefined> {
    const ws = this.parse<StoredWorkspace>(WORKSPACE_KEY);
    if (ws && Array.isArray(ws.entries)) return { ...ws, entries: ws.entries.map((e) => ({ ...e, schedule: upgradeSchedule(e.schedule) })) };
    // Migrate a working copy saved before schedules could be opened side by side.
    const legacy = this.parse<{ name?: string; schedule?: Schedule; version?: number; savedAt?: string }>(LEGACY_KEY);
    if (legacy?.schedule) {
      const id = this.newId();
      return { entries: [{ id, name: legacy.name && legacy.name !== "current" ? legacy.name : "Schedule", schedule: upgradeSchedule(legacy.schedule) }], currentId: id, included: [id], version: 0, savedAt: legacy.savedAt ?? "" };
    }
    return undefined;
  }

  async save(snapshot: WorkspaceSnapshot, baseVersion?: number): Promise<StoredWorkspace> {
    const existing = this.parse<StoredWorkspace>(WORKSPACE_KEY);
    if (baseVersion !== undefined && existing && existing.version !== baseVersion) throw new VersionConflictError(existing.version, baseVersion);
    const rec: StoredWorkspace = { ...snapshot, version: (existing?.version ?? 0) + 1, savedAt: this.now().toISOString() };
    this.storage.setItem(WORKSPACE_KEY, JSON.stringify(rec));
    this.storage.removeItem(LEGACY_KEY); // the workspace record supersedes it
    return rec;
  }

  async clear() {
    this.storage.removeItem(WORKSPACE_KEY);
    this.storage.removeItem(LEGACY_KEY);
  }
}
