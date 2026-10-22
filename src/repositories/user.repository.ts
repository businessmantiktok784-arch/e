import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { isDatabaseConfigured } from '../utils/admin-auth.js';
import { ServiceUnavailableError } from '../utils/service-error.js';
import { nowIso } from '../utils/time.js';
import type {
  AuthSessionRow,
  UserRow,
  VerificationCodeRecord,
} from '../types/community-posts.types.js';

/**
 * Accounts, WhatsApp identity links, verification codes and sessions.
 *
 * REAL DATA POLICY: no synthetic users, no seed rows, no placeholder accounts.
 * Every store below starts empty. When Supabase is configured it is
 * authoritative; otherwise a per-process in-memory store keeps a development
 * instance working, exactly as `admin-auth.ts` does for the Super Admin
 * session. In production, a missing database is an error, never a silent
 * in-memory fallback that forgets every account on restart.
 */

export type CreateVia = 'web' | 'whatsapp';

interface MemoryStores {
  users: Map<string, UserRow>;
  usersByPhoneHash: Map<string, string>;
  identities: Map<string, string>;
  codes: Map<string, VerificationCodeRecord[]>;
  sessions: Map<string, AuthSessionRow>;
}

const memory: MemoryStores = {
  users: new Map(),
  usersByPhoneHash: new Map(),
  identities: new Map(),
  codes: new Map(),
  sessions: new Map(),
};

/** Matches the database default: ET-USER-<4 hex digits>. */
function generatePublicUserId(): string {
  return `ET-USER-${crypto.randomBytes(2).toString('hex')}`;
}

export class UserRepository {
  private get ready(): boolean {
    return isDatabaseConfigured();
  }

  private requireDatabase(operation: string): void {
    if (!this.ready && env.IS_PRODUCTION) {
      throw new Error(
        `Account ${operation} requires a configured database. ` +
          'Set SUPABASE_URL and SUPABASE_SECRET_KEY and run migration 016_community_posts.sql.'
      );
    }
  }

  /**
   * A configured database is authoritative. When a query against it fails we
   * must NOT fall back to the process-local map: doing so would interpret an
   * outage as "the account does not exist" (allowing a duplicate to be created)
   * or accept a session that the database never stored. The failure is surfaced
   * as a controlled 503 instead.
   */
  private databaseFailure(operation: string, err: unknown): ServiceUnavailableError {
    logger.error('Database operation failed; refusing to fall back to process memory', {
      operation,
      error: err instanceof Error ? err.message : String(err),
    });
    return new ServiceUnavailableError(operation, err);
  }

  // ==========================================================================
  // Users
  // ==========================================================================

  async findUserByPhoneHash(phoneHash: string): Promise<UserRow | null> {
    if (!phoneHash) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .select('*')
          .eq('phone_hash', phoneHash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as UserRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('account lookup by phone hash', err);
      }
    }
    const id = memory.usersByPhoneHash.get(phoneHash);
    return id ? memory.users.get(id) ?? null : null;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    if (!id) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as UserRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('account lookup by id', err);
      }
    }
    return memory.users.get(id) ?? null;
  }

  async findUserByPublicUserId(publicUserId: string): Promise<UserRow | null> {
    if (!publicUserId) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .select('*')
          .eq('public_user_id', publicUserId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as UserRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('account lookup by public id', err);
      }
    }
    for (const user of memory.users.values()) {
      if (user.public_user_id === publicUserId) return user;
    }
    return null;
  }

  /**
   * Finds the account for a verified phone hash, creating one when it does not
   * exist yet. This is the single place a new Earth Talk account is born, so a
   * WhatsApp sender and a website login with the same number always resolve to
   * the same account.
   */
  async findOrCreateByPhoneHash(phoneHash: string, createdVia: CreateVia): Promise<UserRow> {
    this.requireDatabase('account creation');

    const existing = await this.findUserByPhoneHash(phoneHash);
    if (existing) return existing;

    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .insert({
            phone_hash: phoneHash,
            created_via: createdVia,
            is_demo: false,
          })
          .select('*')
          .single();
        if (error) {
          // A concurrent request may have created the account first.
          const raced = await this.findUserByPhoneHash(phoneHash);
          if (raced) return raced;
          throw new Error(error.message);
        }
        return data as UserRow;
      } catch (err) {
        const raced = await this.findUserByPhoneHash(phoneHash);
        if (raced) return raced;
        throw err;
      }
    }

    const user: UserRow = {
      id: crypto.randomUUID(),
      public_user_id: generatePublicUserId(),
      display_name: null,
      display_name_updated_at: null,
      phone_hash: phoneHash,
      created_via: createdVia,
      is_demo: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    memory.users.set(user.id, user);
    memory.usersByPhoneHash.set(phoneHash, user.id);
    return user;
  }

  async updateDisplayName(userId: string, displayName: string | null): Promise<UserRow | null> {
    this.requireDatabase('profile update');
    const clean = displayName === null ? null : displayName.trim().slice(0, 60) || null;
    const now = nowIso();

    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('users') as any)
          .update({ display_name: clean, display_name_updated_at: now, updated_at: now })
          .eq('id', userId)
          .select('*')
          .single();
        if (error) throw new Error(error.message);
        return data as UserRow;
      } catch (err) {
        throw this.databaseFailure('profile update', err);
      }
    }

    const user = memory.users.get(userId);
    if (!user) return null;
    const updated: UserRow = {
      ...user,
      display_name: clean,
      display_name_updated_at: now,
      updated_at: now,
    };
    memory.users.set(userId, updated);
    return updated;
  }

  /**
   * Registers an account directly in the development store. Used by tests only,
   * so a rename window can be exercised without waiting seven days.
   */
  registerUser(user: UserRow): void {
    memory.users.set(user.id, user);
    memory.usersByPhoneHash.set(user.phone_hash, user.id);
  }

  // ==========================================================================
  // WhatsApp identity
  // ==========================================================================

  /**
   * Associates a WhatsApp sender with an Earth Talk account. The association is
   * a one-way hash; nothing here can be used to recover a phone number.
   */
  async linkWhatsAppIdentity(userId: string, identityHash: string): Promise<void> {
    if (!userId || !identityHash) return;
    this.requireDatabase('WhatsApp identity link');

    if (this.ready) {
      try {
        const { error } = await (supabase.from('user_whatsapp_identities') as any)
          .upsert(
            {
              user_id: userId,
              wa_identity_hash: identityHash,
              last_seen_at: nowIso(),
            },
            { onConflict: 'wa_identity_hash' }
          );
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('WhatsApp identity link', err);
      }
    }
    memory.identities.set(identityHash, userId);
  }

  async findUserByWhatsAppHash(identityHash: string): Promise<UserRow | null> {
    if (!identityHash) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('user_whatsapp_identities') as any)
          .select('user_id')
          .eq('wa_identity_hash', identityHash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        const userId = (data as { user_id: string } | null)?.user_id;
        return userId ? await this.findUserById(userId) : null;
      } catch (err) {
        throw this.databaseFailure('WhatsApp identity lookup', err);
      }
    }
    const userId = memory.identities.get(identityHash);
    return userId ? memory.users.get(userId) ?? null : null;
  }

  // ==========================================================================
  // Verification codes
  // ==========================================================================

  async saveVerificationCode(record: VerificationCodeRecord): Promise<void> {
    this.requireDatabase('verification code storage');
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_verification_codes') as any).insert({
          id: record.id,
          phone_hash: record.phone_hash,
          code_hash: record.code_hash,
          purpose: record.purpose,
          expires_at: record.expires_at,
          attempts: record.attempts,
          max_attempts: record.max_attempts,
          requested_ip_hash: record.requested_ip_hash,
          delivery: record.delivery,
        });
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('verification code storage', err);
      }
    }
    const list = memory.codes.get(record.phone_hash) ?? [];
    list.push(record);
    memory.codes.set(record.phone_hash, list);
  }

  /**
   * Most recent unconsumed code for a phone hash. An expired or exhausted code
   * is still returned so verification can reject it with the right reason
   * instead of a generic failure that hides an expired link.
   */
  async findLatestVerificationCode(phoneHash: string): Promise<VerificationCodeRecord | null> {
    if (!phoneHash) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('auth_verification_codes') as any)
          .select('*')
          .eq('phone_hash', phoneHash)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as VerificationCodeRecord) ?? null;
      } catch (err) {
        throw this.databaseFailure('verification code lookup', err);
      }
    }
    const list = memory.codes.get(phoneHash) ?? [];
    return list.length > 0 ? list[list.length - 1] : null;
  }

  async updateVerificationCode(
    phoneHash: string,
    codeId: string,
    patch: Partial<Pick<VerificationCodeRecord, 'attempts' | 'consumed_at' | 'delivery'>>
  ): Promise<void> {
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_verification_codes') as any)
          .update(patch)
          .eq('id', codeId)
          .eq('phone_hash', phoneHash);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('verification code update', err);
      }
    }
    const list = memory.codes.get(phoneHash) ?? [];
    const target = list.find((entry) => entry.id === codeId);
    if (target) Object.assign(target, patch);
  }

  /**
   * Invalidates every outstanding code for a phone hash. Called when a new code
   * is requested, so a previously sent code can no longer be replayed.
   */
  async consumeOutstandingCodes(phoneHash: string): Promise<void> {
    const consumedAt = nowIso();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_verification_codes') as any)
          .update({ consumed_at: consumedAt })
          .eq('phone_hash', phoneHash)
          .is('consumed_at', null);
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('verification code invalidation', err);
      }
    }
    for (const entry of memory.codes.get(phoneHash) ?? []) {
      if (!entry.consumed_at) entry.consumed_at = consumedAt;
    }
  }

  // ==========================================================================
  // Sessions
  // ==========================================================================

  async createSession(row: AuthSessionRow): Promise<void> {
    this.requireDatabase('session creation');
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_sessions') as any).insert({
          id: row.id,
          user_id: row.user_id,
          token_hash: row.token_hash,
          expires_at: row.expires_at,
          ip_hash: row.ip_hash,
          user_agent_hash: row.user_agent_hash,
        });
        if (error) throw new Error(error.message);
        return;
      } catch (err) {
        throw this.databaseFailure('session creation', err);
      }
    }
    memory.sessions.set(row.token_hash, row);
  }

  async findSessionByTokenHash(tokenHash: string): Promise<AuthSessionRow | null> {
    if (!tokenHash) return null;
    if (this.ready) {
      try {
        const { data, error } = await (supabase.from('auth_sessions') as any)
          .select('*')
          .eq('token_hash', tokenHash)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (data as AuthSessionRow) ?? null;
      } catch (err) {
        throw this.databaseFailure('session lookup', err);
      }
    }
    return memory.sessions.get(tokenHash) ?? null;
  }

  async revokeSession(tokenHash: string): Promise<boolean> {
    if (!tokenHash) return false;
    const revokedAt = nowIso();
    if (this.ready) {
      try {
        const { error } = await (supabase.from('auth_sessions') as any)
          .update({ revoked_at: revokedAt, updated_at: revokedAt })
          .eq('token_hash', tokenHash);
        if (error) throw new Error(error.message);
      } catch (err) {
        throw this.databaseFailure('session revocation', err);
      }
    }
    const session = memory.sessions.get(tokenHash);
    if (session) {
      session.revoked_at = revokedAt;
      return true;
    }
    // An unknown token is still recorded as revoked so a replayed token is
    // rejected on a later request rather than accepted by the memory store.
    memory.sessions.set(tokenHash, {
      id: crypto.randomUUID(),
      user_id: '',
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      revoked_at: revokedAt,
      last_used_at: revokedAt,
      ip_hash: null,
      user_agent_hash: null,
      created_at: revokedAt,
      updated_at: revokedAt,
    });
    return true;
  }

  async touchSession(tokenHash: string): Promise<void> {
    const lastUsedAt = nowIso();
    if (this.ready) {
      try {
        await (supabase.from('auth_sessions') as any)
          .update({ last_used_at: lastUsedAt })
          .eq('token_hash', tokenHash);
        return;
      } catch {
        // A failed touch must not fail the request; the session is still valid.
      }
    }
    const session = memory.sessions.get(tokenHash);
    if (session) session.last_used_at = lastUsedAt;
  }

  /** Test helper: the number of accounts held in the development memory store. */
  get memoryAccountCount(): number {
    return memory.users.size;
  }
}

export const userRepository = new UserRepository();
