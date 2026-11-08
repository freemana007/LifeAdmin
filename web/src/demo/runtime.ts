/**
 * Minimal typings for the claude.ai artifact runtime that the demo build
 * uses. Every capability is optional: `use()` resolves null when absent.
 */
export interface SampleLike {
  json<T = unknown>(input: string, options?: { images?: Blob[]; modelTier?: "quick" | "default" | "complex"; cache?: boolean }): Promise<T>;
  limits(): Promise<{ images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>;
}

export interface DocSnap {
  id: string;
  exists: boolean;
  data(): Record<string, unknown> | undefined;
}
export interface DocRef {
  get(): Promise<DocSnap>;
  set(data: Record<string, unknown>): Promise<void>;
  delete(): Promise<void>;
}
export interface CollectionRef {
  doc(id: string): DocRef;
  get(): Promise<{ docs: DocSnap[] }>;
}
export interface DbLike {
  collection(path: string): CollectionRef;
}
export interface UserLike {
  id(): Promise<string | null>;
  me(): Promise<{ id: string | null; name: string }>;
}

type Use = <T>(name: string) => Promise<T | null>;

function use<T>(name: string): Promise<T | null> {
  const c = (window as unknown as { claude?: { use?: Use } }).claude;
  if (!c?.use) return Promise.resolve(null);
  return c.use<T>(name).catch(() => null);
}

export const runtime = {
  sample: () => use<SampleLike>("sample"),
  db: () => use<DbLike>("db"),
  user: () => use<UserLike>("user"),
};
