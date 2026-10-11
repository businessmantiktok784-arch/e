import { env } from '../config/env.js';

interface RateLimitRecord {
  timestamps: number[];
}

export class RateLimiter {
  private readonly limits = new Map<string, RateLimitRecord>();
  private readonly processedMessageIds = new Map<string, number>();

  /**
   * Checks whether the user has exceeded their AI analysis rate limit.
   * If not exceeded, records the current request.
   */
  isRateLimited(userId: string): boolean {
    const now = Date.now();
    const windowMs = env.AI_RATE_LIMIT_WINDOW_SECONDS * 1000;
    const maxRequests = env.AI_RATE_LIMIT_PER_USER;

    const record = this.limits.get(userId) || { timestamps: [] };

    // Filter out timestamps outside the active rolling window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

    if (record.timestamps.length >= maxRequests) {
      return true;
    }

    record.timestamps.push(now);
    this.limits.set(userId, record);
    return false;
  }

  /**
   * Checks whether a message ID has already been processed (Deduplication).
   * Returns true if already processed, otherwise marks it as processed and returns false.
   */
  isDuplicate(messageId: string): boolean {
    const now = Date.now();
    const ttlMs = 24 * 60 * 60 * 1000; // 24 hours TTL

    // Clean up expired message IDs occasionally
    if (this.processedMessageIds.size > 2000) {
      for (const [id, timestamp] of this.processedMessageIds.entries()) {
        if (now - timestamp > ttlMs) {
          this.processedMessageIds.delete(id);
        }
      }
    }

    if (this.processedMessageIds.has(messageId)) {
      return true;
    }

    this.processedMessageIds.set(messageId, now);
    return false;
  }

  /**
   * Message sent when rate limit is exceeded.
   */
  getRateLimitMessage(): string {
    return '🪨 You have reached the current Earth Talk testing limit.\n\nPlease try again later.';
  }
}

export const rateLimiter = new RateLimiter();

/**
 * Generic fixed-window rate limiter shared by the admin, community and export
 * surfaces. Keys are explicit (for example `community_vote:<ip>`), so the
 * caller is responsible for scoping the window to the actor it intends.
 *
 * Returns true when the request is allowed. The window resets on first use.
 */
const genericWindows = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const entry = genericWindows.get(key);

  if (!entry || entry.resetAt < now) {
    genericWindows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

/**
 * Drops expired windows. Called opportunistically so the map cannot grow
 * without bound on a long-running process.
 */
export function pruneRateLimitWindows(windowMs = 60_000): void {
  const now = Date.now();
  for (const [key, entry] of genericWindows.entries()) {
    if (entry.resetAt + windowMs < now) {
      genericWindows.delete(key);
    }
  }
}

