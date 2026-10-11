/**
 * Simple structured logger for Earth Talk
 * Ensures sensitive information such as access tokens are never logged.
 */

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

function formatTimestamp(): string {
  return new Date().toISOString();
}

function sanitize(data: unknown): unknown {
  if (!data) return data;
  if (typeof data === 'string') {
    // Redact Bearer tokens or anything looking like Meta access tokens
    return data.replace(/(EA[A-Za-z0-9_-]{20,})/g, '[REDACTED_ACCESS_TOKEN]')
               .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED_ACCESS_TOKEN]');
  }
  if (typeof data === 'object') {
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      if (/token|secret|auth|password|key/i.test(key)) {
        sanitizedObj[key] = '[REDACTED]';
      } else {
        sanitizedObj[key] = sanitize(val);
      }
    }
    return sanitizedObj;
  }
  return data;
}

export const logger = {
  info(message: string, meta?: unknown): void {
    const timestamp = formatTimestamp();
    if (meta !== undefined) {
      console.log(`[${timestamp}] [INFO] ${message}`, JSON.stringify(sanitize(meta)));
    } else {
      console.log(`[${timestamp}] [INFO] ${message}`);
    }
  },

  warn(message: string, meta?: unknown): void {
    const timestamp = formatTimestamp();
    if (meta !== undefined) {
      console.warn(`[${timestamp}] [WARN] ${message}`, JSON.stringify(sanitize(meta)));
    } else {
      console.warn(`[${timestamp}] [WARN] ${message}`);
    }
  },

  error(message: string, meta?: unknown): void {
    const timestamp = formatTimestamp();
    if (meta !== undefined) {
      console.error(`[${timestamp}] [ERROR] ${message}`, JSON.stringify(sanitize(meta)));
    } else {
      console.error(`[${timestamp}] [ERROR] ${message}`);
    }
  },

  debug(message: string, meta?: unknown): void {
    const timestamp = formatTimestamp();
    if (meta !== undefined) {
      console.debug(`[${timestamp}] [DEBUG] ${message}`, JSON.stringify(sanitize(meta)));
    } else {
      console.debug(`[${timestamp}] [DEBUG] ${message}`);
    }
  },
};
