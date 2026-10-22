# Earth Talk — Backup & Disaster Recovery Runbook

## 1. Executive Summary

This document specifies the business continuity, backup strategy, and disaster recovery procedures for the Earth Talk platform (Rwanda Citizen Geological Observation Network).

> Backup filenames written by earlier runs use the `rock_talk_` prefix. Those
> files remain valid; the prefix change applies to new dumps only.

- **Recovery Point Objective (RPO)**: < 1 hour (PostgreSQL Write-Ahead Logging & snapshot archives)
- **Recovery Time Objective (RTO)**: < 2 hours for full platform restoration

---

## 2. Infrastructure Backup Architecture

### 2.1 Database (Supabase PostgreSQL + PostGIS)
- **Automated Snapshots**: Daily full physical backups retained for 30 days.
- **Continuous Write-Ahead Logging (WAL)**: Point-In-Time Recovery (PITR) enabled allowing rollback to any second in the past 7 days.
- **Logical Backups**: Daily dump using `pg_dump` of schemas `public` and PostGIS metadata tables:
  ```bash
  pg_dump -h $SUPABASE_HOST -U postgres -d postgres -F c -b -v -f earth_talk_backup_$(date +%Y%m%d).dump
  ```

### 2.2 Geological Media Storage (Rock Specimens)
- Citizen-submitted original rock photographs are stored in a private, encrypted Supabase Storage bucket (`observation-media`).
- Cross-region bucket replication configured to secondary cloud region.
- Metadata table `public.observation_media` contains cryptographic SHA-256 checksums to verify media integrity post-restoration.

### 2.3 Research Datasets & Audit Trails
- Authoritative expert reviews and verification audit logs are stored in append-only tables (`public.verification_audit_logs`, `public.compliance_audit_logs`).
- Every export is tagged with a reproducible dataset version identifier (e.g., `RT-RW-RESEARCH-2026-001`).
- Historical datasets are mirrored to cold storage on every release cycle.

---

## 3. Disaster Recovery Procedures

### 3.1 Scenario A: Corrupt Database / Accidental Data Loss
1. **Freeze Application Traffic**:
   Redirect incoming WhatsApp webhooks and public traffic to maintenance mode.
2. **Identify Target Restoration Point**:
   Check `public.compliance_audit_logs` to pinpoint the exact UTC timestamp prior to corruption.
3. **Execute Point-In-Time Recovery**:
   Trigger PITR via Supabase CLI / Management Console:
   ```bash
   supabase db restore --target-time "2026-10-01T12:00:00Z"
   ```
4. **Run Verification Test Suite**:
   Execute automated validation tests across Stages 2–6:
   ```bash
   npm test
   ```
5. **Resume Normal Traffic**.

### 3.2 Scenario B: Compromised Secrets / Key Rotation
If `EXPERT_SESSION_SECRET`, `GEMINI_API_KEY`, or `WHATSAPP_ACCESS_TOKEN` is compromised:
1. Immediately revoke active sessions in the database:
   ```sql
   UPDATE public.expert_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL;
   ```
2. Generate new cryptographically secure 256-bit secrets:
   ```bash
   openssl rand -hex 32
   ```
3. Update production environment variables in Google Cloud Run / container orchestration.
4. Restart backend processes (`npm run start`).
5. All reviewers are required to re-authenticate with the new session secret.

---

## 4. Verification & Testing Schedule

- **Automated Backup Integrity Test**: Weekly restoration to a staging database environment.
- **Disaster Simulation Drill**: Quarterly rehearsal of complete database teardown and rebuild from migration scripts `001_extensions.sql` through `009_stage6_production_research.sql`.
