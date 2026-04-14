# Arena360 Backup and Restore

This document describes how to back up and restore the Arena360 PostgreSQL database and local file storage (no Docker dependency).

## Prerequisites

- **PostgreSQL client tools** installed and on `PATH`:
  - `pg_dump` (for backup)
  - `psql` (for restore)
- On Windows, install [PostgreSQL](https://www.postgresql.org/download/windows/) or use [scoop](https://scoop.sh): `scoop install postgresql`
- On macOS: `brew install libpq` and ensure `pg_dump`/`psql` are on PATH

## Backup

### Option 1: PowerShell script (recommended)

From the project root (or `arena360-api`):

```powershell
# From repo root; uses arena360-api\.env DATABASE_URL if present
.\scripts\backup-db.ps1

# Or specify output file
.\scripts\backup-db.ps1 -OutFile "D:\Backups\arena360-2025-03-06.sql"
```

The script:

- Reads `DATABASE_URL` from `arena360-api\.env` if it exists, or uses `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` environment variables
- Runs `pg_dump` in plain SQL format (schema + data)
- Writes to `backups/arena360-YYYY-MM-DD-HHmmss.sql` by default, or the path you pass with `-OutFile`

## File storage

Arena360 uses `uploads/` for local filesystem storage when S3 or MinIO is not configured. The repo includes a matching PowerShell pair:

```powershell
.\scripts\backup-storage.ps1
.\scripts\restore-storage.ps1 -ArchivePath ".\backups\uploads-drill.zip"
```

The backup script zips the current `uploads/` tree into `backups/uploads-YYYY-MM-DD-HHmmss.zip`. The restore script extracts that archive into a target directory so you can validate the round-trip in a scratch location before promoting it.

### Option 2: Manual pg_dump

```bash
# Parse DATABASE_URL or set explicitly, e.g.:
# PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres PGDATABASE=arena360

pg_dump -h localhost -p 5432 -U postgres -d arena360 --no-owner --no-acl -f arena360-backup.sql
```

- `--no-owner --no-acl`: avoids restore errors when restoring as a different user.
- For compressed backup: add `-Fc` for custom format and use `pg_restore` for restore, or pipe: `pg_dump ... | gzip > arena360.sql.gz`.

## Restore

1. **Create the database** (if it doesn’t exist):

   ```bash
   psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE arena360;"
   ```

2. **Restore from a plain SQL backup**:

   ```bash
   psql -h localhost -p 5432 -U postgres -d arena360 -f arena360-backup.sql
   ```

   Or on Windows PowerShell:

   ```powershell
   Get-Content .\arena360-backup.sql | psql -h localhost -p 5432 -U postgres -d arena360
   ```

3. **If you used custom format** (`pg_dump -Fc`):

   ```bash
   pg_restore -h localhost -p 5432 -U postgres -d arena360 --no-owner --no-acl arena360-backup.dump

For local file storage, restore the latest `uploads-*.zip` archive into a scratch directory first, verify the files, and then swap it back into place only if the round-trip matches.
   ```

## Retention and scheduling

- Keep backups in a dedicated folder (e.g. `D:\Backups\arena360`) and define a retention policy (e.g. last 7 daily, 4 weekly).
- Schedule the PowerShell script via **Task Scheduler** (Windows) or cron (Linux/macOS) to run daily.
- Store backups off-server (e.g. network share or cloud) for disaster recovery.
- For file storage, keep the zip archive off-server as well, or in object storage if you already use S3/MinIO in production.

## Disaster recovery (DR)

1. Provision a new PostgreSQL server (or use an existing one).
2. Create the database and restore from the latest backup using the steps above.
3. Update `arena360-api\.env` (or environment) with the new `DATABASE_URL`.
4. Run migrations if needed: `npx prisma migrate deploy` (if using migrations) or rely on schema in the dump.
5. Restart the API and frontend; verify health and login.

## Notes

- Backups are **plain SQL** by default; for very large databases, consider custom format (`-Fc`) and `pg_restore` for parallel restore.
- Ensure `.env` and backup files are not committed to version control; add `backups/` and `*.sql` to `.gitignore` if applicable.
