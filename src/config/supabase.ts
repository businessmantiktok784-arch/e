import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
import type { Database } from '../types/database.types.js';

let supabaseUrl = env.SUPABASE_URL;
let supabaseKey = env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseUrl.startsWith('http') || supabaseUrl.includes('REQUIRED')) {
  supabaseUrl = 'https://mock-project-id.supabase.co';
}
if (!supabaseKey || supabaseKey.includes('REQUIRED')) {
  supabaseKey = 'dev_supabase_key_not_configured';
}

/**
 * Singleton server-side Supabase client with service privileges.
 * Used exclusively on the backend; never exposed to clients or user devices.
 */
export const supabase: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
