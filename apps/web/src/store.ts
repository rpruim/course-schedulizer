import type { Schedule } from "@schedulizer/core";

/**
 * Where schedules live. v1 is browser storage; a hosted service would implement
 * the same interface (spec §9, §10 H2–H5) without touching the core or the views.
 */
export interface StoredInfo {
  id: string;
  name: string;
  version: number;
  savedAt: string;
}

export interface StoredSchedule extends StoredInfo {
  schedule: Schedule;
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

export interface ScheduleStore {
  list(): Promise<StoredInfo[]>;
  load(id: string): Promise<StoredSchedule | undefined>;
  /** Saves and returns the new record (version + 1). Throws `VersionConflictError` if `baseVersion` is stale. */
  save(id: string, schedule: Schedule, baseVersion?: number): Promise<StoredSchedule>;
  remove(id: string): Promise<void>;
}

type KeyValue = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

/** Browser-storage implementation (`localStorage` by default; anything Storage-shaped works). */
export class LocalStore implements ScheduleStore {
  constructor(
    private readonly storage: KeyValue,
    private readonly prefix = "schedulizer:",
    private readonly now: () => Date = () => new Date(),
  ) {}

  private read(id: string): StoredSchedule | undefined {
    const text = this.storage.getItem(this.prefix + id);
    if (!text) return undefined;
    try {
      return JSON.parse(text) as StoredSchedule;
    } catch {
      return undefined; // a corrupt record is treated as absent rather than breaking the app
    }
  }

  async list(): Promise<StoredInfo[]> {
    const out: StoredInfo[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(this.prefix)) continue;
      const rec = this.read(key.slice(this.prefix.length));
      if (rec) out.push({ id: rec.id, name: rec.name, version: rec.version, savedAt: rec.savedAt });
    }
    return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  }

  async load(id: string) {
    return this.read(id);
  }

  async save(id: string, schedule: Schedule, baseVersion?: number): Promise<StoredSchedule> {
    const existing = this.read(id);
    if (baseVersion !== undefined && existing && existing.version !== baseVersion) {
      throw new VersionConflictError(existing.version, baseVersion);
    }
    const rec: StoredSchedule = {
      id,
      name: schedule.meta.name || id,
      version: (existing?.version ?? 0) + 1,
      savedAt: this.now().toISOString(),
      schedule,
    };
    this.storage.setItem(this.prefix + id, JSON.stringify(rec));
    return rec;
  }

  async remove(id: string) {
    this.storage.removeItem(this.prefix + id);
  }
}
