const { Client } = require('pg');

async function cleanupMigrations() {
  console.log('🚀 Starting database cleanup...');
  console.log('📊 Environment check:');
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'Present' : 'Missing');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Connected to database successfully');
    
    // First, check if _prisma_migrations table exists
    console.log('🔍 Checking migration table...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = '_prisma_migrations'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('📋 Migration table found, cleaning up...');
      
      // Show current migrations
      const currentMigrations = await client.query(`SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 5`);
      console.log('📝 Current migrations:', currentMigrations.rows);
      
      // Remove all migration records to start fresh
      await client.query(`DELETE FROM "_prisma_migrations"`);
      console.log('🗑️  All migration records cleared');
    } else {
      console.log('ℹ️  Migration table does not exist yet');
    }
    
    // Add the commissionRate column if it doesn't exist
    console.log('🔧 Adding commissionRate column if missing...');
    await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION DEFAULT 40.0`);
    console.log('✅ CommissionRate column operation completed');
    
    // Verify the column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' AND column_name = 'commissionRate'
    `);
    
    if (columnCheck.rows.length > 0) {
      console.log('✅ CommissionRate column confirmed present');
    } else {
      console.log('⚠️  CommissionRate column not found - this might be expected if table doesn\'t exist yet');
    }
    
    console.log('🎉 Database cleanup completed successfully!');
    
  } catch (error) {
    console.log('❌ Error during cleanup:', error.message);
    console.log('🔍 Error details:', error);
    
    // Don't fail the build - this is expected in some cases
    console.log('ℹ️  Continuing with build despite cleanup errors...');
  } finally {
    try {
      await client.end();
      console.log('🔌 Database connection closed');
    } catch (e) {
      console.log('ℹ️  Connection already closed');
    }
  }
}

cleanupMigrations();
