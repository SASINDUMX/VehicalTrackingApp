# Database Migrations Archive

This directory stores historical, superseded PostgreSQL migration scripts (v2 through v12) and hotfix patches.

## Single Source of Truth
All schema tables, partial unique indexes, functions, triggers, immutability rules, and RPCs in these migration scripts have been consolidated into the idempotent, production-ready schema at the root of the repository:

👉 **[`/supabase_schema.sql`](../../supabase_schema.sql)**

### Active Scripts Kept in `scripts/`:
- `generate_icons.js`: PWA & App icon generation pipeline.
- `post_build.js`: Post-build manifest and service worker injection.
- `seed.js`: Node.js seed script for demo data.
- `seed_15_users.sql`: SQL seed script to create all 15 operational test profiles across the 5 workshop roles.
