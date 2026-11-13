# UNI-TRACK operations, backup and recovery runbook

This document defines the operational controls required for production. Source code cannot enable or verify MongoDB Atlas backups, Render secret values, or a successful restore by itself.

## Data protection responsibilities

- Tracker payloads are encrypted in the browser before API persistence. Account fields and operational metadata are not all end-to-end encrypted.
- Recently deleted trackers are retained for 30 days, then MongoDB's TTL monitor removes them. TTL deletion is asynchronous and is not a backup.
- Device private-key recovery codes protect access to encrypted tracker payloads. They do not restore a deleted MongoDB database.
- Offline snapshots are account-scoped browser storage and are not a server backup.

## Required production backup configuration

Configure these controls in the MongoDB Atlas project that owns the production database:

1. Enable automated cloud backups or continuous backup for the production cluster, subject to the Atlas plan's capabilities.
2. Set a retention window appropriate to the product's recovery objectives. A practical starting point is 7 daily restore points and 4 weekly restore points where supported.
3. Restrict backup access to the smallest trusted operator group and enable MFA on the cloud account.
4. Keep database credentials and encryption environment variables in the Render service's secret environment, never in GitHub source files.
5. Document the Atlas project, cluster, database name, backup policy owner and escalation contact in private operations records.

## Restore procedure

1. Declare an incident and stop writes to the affected production service if continuing writes could make recovery inconsistent.
2. Select a restore point immediately before the incident window.
3. Restore into a separate recovery cluster or database first; do not overwrite production immediately.
4. Verify collection counts, user-to-tracker ownership, representative tracker records, subscriptions and indexes.
5. Confirm that encrypted tracker payloads remain paired with the corresponding user's private key. A database restore cannot reconstruct a lost client private key or recovery code.
6. Run API smoke tests and a controlled test-account sign-in before switching the production connection.
7. Update the Render database secret only after the recovery database has passed verification.
8. Reopen writes and monitor API errors, database health and user reports.

## Recovery objectives and drills

- Suggested initial recovery point objective (RPO): 24 hours or better, depending on the Atlas backup plan.
- Suggested initial recovery time objective (RTO): 4 hours or better, to be validated by an actual restore drill.
- Run a restore drill at least quarterly and after major database migrations.
- Record the restore point, elapsed time, validation checks, issues and responsible operator.
- Never use real user passwords, private keys or recovery codes in test fixtures or incident tickets.

## Deployment checklist

- [ ] Atlas automated/continuous backup policy enabled and verified in Atlas.
- [ ] Restore access limited and protected with MFA.
- [ ] Render has valid `MONGODB_URI`, `JWT_SECRET`, `OTP_HASH_SECRET`, Brevo and VAPID configuration.
- [ ] `CRON_SECRET` is configured if an external scheduler calls the protected cron endpoint.
- [ ] Restore drill completed against a non-production target.
- [ ] Recovery instructions and operator ownership stored in the team's private runbook.

**Current status:** this repository contains the policy and restore procedure only. Atlas backup enablement, retention settings and a successful restore drill require access to the actual cloud database project and have not been verified by this code change.
