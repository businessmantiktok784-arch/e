import { env } from './env.js';

/**
 * Structural recognition of the database credentials this application requires.
 *
 * Two failure modes motivated this module:
 *
 *   1. A partially configured environment. `SUPABASE_URL` could be a real project
 *      URL while `SUPABASE_SECRET_KEY` still held the development sentinel
 *      `dev_supabase_key_not_configured`. The old substring check saw no
 *      "placeholder"-looking value and reported the database as configured, so
 *      every write failed with a 401 while the app claimed durability.
 *   2. A public key used as a privileged credential. Supabase publishable/anon
 *      keys and server secret keys are different credentials; only the secret
 *      key may back a server-side, RLS-bypassing write path.
 *
 * These helpers are pure and never log or include a credential *value* in their
 * messages, only the variable names that need attention.
 */

/**
 * Kept in step with the marker list in `env.ts`: a value copied from
 * `.env.example` must be recognised as "not configured" everywhere.
 */
const PLACEHOLDER_MARKERS = [
  'placeholder',
  'mock-project-id',
  'test_',
  'changeme',
  'replace_me',
  'required in production',
  '# required',
  'required',
];

function looksLikePlaceholder(value: string): boolean {
  if (!value) return true;
  const trimmed = value.trim();
  if (trimmed.startsWith('#')) return true;
  const lowered = trimmed.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lowered.includes(marker));
}

/** True when `url` is structurally a Supabase project URL, not a placeholder. */
export function isSupabaseUrlConfigured(url: string | undefined): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (looksLikePlaceholder(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export type SupabaseKeyKind =
  | 'secret'
  | 'legacy-service'
  | 'publishable'
  | 'anon'
  | 'unknown';

/**
 * Classifies a Supabase API key without verifying it against the server.
 *
 * Supabase issues two families of key:
 *   - `sb_secret_...` (server) and `sb_publishable_...` (browser).
 *   - Legacy JWTs (`eyJ...`), distinguished by the `role` claim: `service_role`
 *     is privileged, `anon` is not.
 *
 * Decoding the payload is safe: it is base64url JSON that is already public in
 * the key. It is never logged.
 */
export function classifySupabaseKey(key: string | undefined): SupabaseKeyKind {
  if (!key) return 'unknown';
  const trimmed = key.trim();
  if (trimmed.startsWith('sb_secret_')) return 'secret';
  if (trimmed.startsWith('sb_publishable_')) return 'publishable';
  if (trimmed.startsWith('eyJ')) {
    const parts = trimmed.split('.');
    if (parts.length === 3) {
      try {
        const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
        return payload?.role === 'anon' ? 'anon' : 'legacy-service';
      } catch {
        return 'unknown';
      }
    }
  }
  return 'unknown';
}

/**
 * True when `key` is a privileged server credential.
 *
 * Publishable, anon and unrecognised keys all return false: they cannot carry
 * the row-level-security-bypassing writes the server needs, and accepting them
 * would silently defer every failure to request time.
 */
export function isSupabaseServerKeyConfigured(key: string | undefined): boolean {
  if (!key) return false;
  if (looksLikePlaceholder(key)) return false;
  const kind = classifySupabaseKey(key);
  if (kind === 'secret') return key.trim().length > 'sb_secret_'.length + 8;
  if (kind === 'legacy-service') return true;
  return false;
}

export interface DatabaseConfigStatus {
  configured: boolean;
  /** Human-readable, credential-free reasons the database is not usable. */
  issues: string[];
}

/**
 * Describes whether a usable database configuration is present.
 *
 * The returned strings name the variable to fix and never include its value, so
 * they are safe to log at startup and in errors.
 */
export function describeDatabaseConfig(): DatabaseConfigStatus {
  const issues: string[] = [];

  if (!isSupabaseUrlConfigured(env.SUPABASE_URL)) {
    issues.push(
      'SUPABASE_URL is missing or still a placeholder; set the project URL (https://<project-ref>.supabase.co)'
    );
  }

  const keyKind = classifySupabaseKey(env.SUPABASE_SECRET_KEY);
  if (!isSupabaseServerKeyConfigured(env.SUPABASE_SECRET_KEY)) {
    if (keyKind === 'publishable' || keyKind === 'anon') {
      issues.push(
        'SUPABASE_SECRET_KEY holds a public/anon key; set the privileged server secret key (Project Settings -> API)'
      );
    } else {
      issues.push('SUPABASE_SECRET_KEY is missing or still a placeholder');
    }
  }

  return { configured: issues.length === 0, issues };
}
