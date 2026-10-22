/** Prevents rapid duplicate taps from starting concurrent writes for one record. */
export async function runOnce<T>(locks: Set<string>, key: string, action: () => Promise<T>): Promise<T | undefined> {
  if (locks.has(key)) return undefined;
  locks.add(key);
  try { return await action(); }
  finally { locks.delete(key); }
}
