import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import type { Database } from '../types/database.types.js';

if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
  logger.error('Missing Supabase configuration');
  throw new Error('Supabase URL and secret key must be configured in environment');
}

/**
 * Singleton server-side Supabase client with service privileges.
 * Used exclusively on the backend; never exposed to clients or user devices.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  env.SUPABASE_URL,
  env.SUPABASE_SECRET_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
