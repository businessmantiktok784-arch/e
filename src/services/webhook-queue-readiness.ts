import { env } from '../config/env.js';
import { describeDatabaseConfig } from '../config/database-config.js';
import { supabase } from '../config/supabase.js';

/**
 * Startup verification of the durable webhook queue.
 *
 * `durable = true` says "a database is configured". It does NOT say the queue
 * schema is actually reachable: a migration that was never applied, or a stale
 * PostgREST schema cache after one was applied, both leave the repositories
 * pointing at functions that do not exist. The worker then logs a
 * "Could not find the function public.claim_webhook_job" error on every tick.
 *
 * This probe answers the question the operator actually cares about — "will a
 * webhook survive a restart right now?" — before the queue reports itself as
 * enabled, and it names the exact blocker when it will not.
 */

export const REQUIRED_QUEUE_FUNCTIONS = [
  'claim_webhook_job',
  'claim_webhook_message',
  'recover_stale_webhook_jobs',
  'recover_stale_webhook_claims',
  'webhook_job_stats',
] as const;

export const REQUIRED_QUEUE_TABLES = ['webhook_jobs', 'webhook_message_claims'] as const;

export interface DurableQueueReadiness {
  ready: boolean;
  /** Credential-free, actionable reason the queue is not operational. */
  blocker: string | null;
  missingFunctions: string[];
  missingTables: string[];
}

const MIGRATION_HINT =
  'Apply the queue schema with `supabase db push`. If it is already applied, reload the PostgREST schema cache ' +
  "(Supabase Dashboard -> Project Settings -> API -> Reload schema, or run `NOTIFY pgrst, 'reload schema';`).";

/**
 * Reads the PostgREST OpenAPI document and returns the exposed `/rpc/*` names.
 *
 * Returns null when the document cannot be read (network/format), which is
 * reported as a separate blocker rather than "everything is missing".
 */
async function fetchExposedFunctionNames(timeoutMs = 5_000): Promise<Set<string> | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const base = env.SUPABASE_URL.replace(/\/+$/, '');
    const response = await fetch(`${base}/rest/v1/`, {
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        Accept: 'application/openapi+json',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const spec = (await response.json()) as { paths?: Record<string, unknown> };
    const paths = spec?.paths ?? {};
    return new Set(
      Object.keys(paths)
        .filter((path) => path.startsWith('/rpc/'))
        .map((path) => path.slice('/rpc/'.length))
    );
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifies the durable queue end to end: configuration, tables and the claim
 * functions. Never throws; a failure is reported as `ready: false` plus a
 * blocker string.
 */
export async function checkDurableQueueReadiness(): Promise<DurableQueueReadiness> {
  const config = describeDatabaseConfig();
  if (!config.configured) {
    return {
      ready: false,
      blocker: `Database is not configured: ${config.issues.join('; ')}.`,
      missingFunctions: [],
      missingTables: [],
    };
  }

  const missingTables: string[] = [];
  for (const table of REQUIRED_QUEUE_TABLES) {
    const { error } = await (supabase.from(table) as any).select('*', { count: 'exact', head: true });
    if (error) missingTables.push(table);
    if (error && missingTables.length === 1) {
      // First failure is almost always connectivity/credentials, not one missing
      // table; keep the underlying message, which is safe (names only).
      return {
        ready: false,
        blocker: `Cannot read public.${table}: ${error.message}. ${MIGRATION_HINT}`,
        missingFunctions: [],
        missingTables,
      };
    }
  }

  const exposed = await fetchExposedFunctionNames();
  if (exposed === null) {
    // Fall back to a single safe RPC so a transient schema-document failure does
    // not masquerade as a missing function.
    const { error } = await (supabase as any).rpc('webhook_job_stats');
    if (error) {
      return {
        ready: false,
        blocker: `Could not read the PostgREST schema and webhook_job_stats failed: ${error.message}. ${MIGRATION_HINT}`,
        missingFunctions: [],
        missingTables,
      };
    }
    return { ready: true, blocker: null, missingFunctions: [], missingTables };
  }

  const missingFunctions = REQUIRED_QUEUE_FUNCTIONS.filter((name) => !exposed.has(name));
  if (missingFunctions.length > 0) {
    return {
      ready: false,
      blocker:
        `The queue schema is not fully visible to the API: missing function(s) ${missingFunctions.join(', ')}. ` +
        MIGRATION_HINT,
      missingFunctions: [...missingFunctions],
      missingTables,
    };
  }

  return { ready: true, blocker: null, missingFunctions: [], missingTables };
}
