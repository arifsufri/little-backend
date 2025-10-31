const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function cleanupMigrations() {
  console.log('🚀 Starting Prisma migration cleanup...');
  console.log('📊 Environment check:');
  console.log('- DATABASE_URL:', process.env.DATABASE_URL ? 'Present' : 'Missing');
  console.log('- NODE_ENV:', process.env.NODE_ENV);
  
  try {
    // Step 1: Mark the failed migration as rolled back
    console.log('🔄 Marking failed migration as rolled back...');
    const rollbackResult = await execAsync('npx prisma migrate resolve --rolled-back "20241030_init"');
    console.log('✅ Migration marked as rolled back:', rollbackResult.stdout);
    
    // Step 2: Add the missing commissionRate column manually using Prisma db execute
    console.log('🔧 Adding commissionRate column...');
    const addColumnSQL = 'ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION DEFAULT 40.0;';
    
    // Write SQL to a temporary file and execute it
    const fs = require('fs');
    fs.writeFileSync('/tmp/add_commission_rate.sql', addColumnSQL);
    
    const executeResult = await execAsync('npx prisma db execute --file /tmp/add_commission_rate.sql');
    console.log('✅ Column added successfully:', executeResult.stdout);
    
    // Clean up temp file
    fs.unlinkSync('/tmp/add_commission_rate.sql');
    
    console.log('🎉 Migration cleanup completed successfully using Prisma commands!');
    
  } catch (error) {
    console.log('❌ Error during Prisma migration cleanup:', error.message);
    
    // Fallback to direct database approach if Prisma commands fail
    console.log('🔄 Falling back to direct database approach...');
    await fallbackDirectCleanup();
  }
}

async function fallbackDirectCleanup() {
  const { Client } = require('pg');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
  
  try {
    await client.connect();
    console.log('✅ Connected to database for fallback cleanup');
    
    // Mark migration as rolled back in the migrations table
    await client.query(`
      UPDATE "_prisma_migrations" 
      SET finished_at = NULL, rolled_back_at = NOW() 
      WHERE migration_name = '20241030_init'
    `);
    console.log('✅ Migration marked as rolled back in database');
    
    // Add the commissionRate column
    await client.query(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION DEFAULT 40.0`);
    console.log('✅ CommissionRate column added');
    
  } catch (error) {
    console.log('❌ Fallback cleanup error:', error.message);
    console.log('ℹ️  Continuing with build...');
  } finally {
    await client.end();
  }
}

cleanupMigrations();
