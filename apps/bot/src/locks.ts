const locks = new Map<string, number>();

export function acquireLock(key: string, ttlMs = 15000) {
  const now = Date.now();
  const existing = locks.get(key);
  if (existing && existing > now) return false;
  locks.set(key, now + ttlMs);
  return true;
}

export function releaseLock(key: string) {
  locks.delete(key);
}

export function sweepLocks() {
  const now = Date.now();
  for (const [key, expiresAt] of locks) {
    if (expiresAt <= now) locks.delete(key);
  }
}
