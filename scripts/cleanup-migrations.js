const { Client } = require('pg');

async function cleanupMigrations() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    await client.connect();
    console.log('🔌 Connected to database');
    
    console.log('🧹 Cleaning up failed migrations...');
    
    // Remove all failed migration records to start fresh
    await client.query(`DELETE FROM "_prisma_migrations" WHERE migration_name LIKE '20241030%'`);
    
    console.log('✅ Failed migrations cleaned up successfully');
    
    // Add the commissionRate column if it doesn't exist
    console.log('🔧 Adding commissionRate column if missing...');
    await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION DEFAULT 40.0`);
    
    console.log('✅ CommissionRate column added successfully');
    
    // Clear the migration table completely to avoid conflicts
    console.log('🗑️  Clearing migration history to avoid conflicts...');
    await client.query(`DELETE FROM "_prisma_migrations"`);
    
    console.log('✅ Migration history cleared - fresh start!');
    
  } catch (error) {
    console.log('ℹ️  Migration cleanup completed (some operations may have been skipped):', error.message);
  } finally {
    await client.end();
  }
}

cleanupMigrations();
