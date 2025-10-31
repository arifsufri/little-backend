-- This script fixes the failed migration issue in production
-- Run this directly on your production database

-- 1. Remove the failed migration record
DELETE FROM "_prisma_migrations" WHERE migration_name = '20241030_init';

-- 2. Add the commissionRate column if it doesn't exist
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION DEFAULT 40.0;

-- 3. Mark our new migration as applied
INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (
    gen_random_uuid(),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    NOW(),
    '20241030_add_commission_rate',
    '',
    NULL,
    NOW(),
    1
);
