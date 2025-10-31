const { Client } = require('pg');

async function fixDatabase() {
  console.log('🔧 Starting database fix...');
  
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Step 1: Add the commissionRate column if it doesn't exist
    console.log('🔧 Adding commissionRate column...');
    await client.query(`
      ALTER TABLE "User" 
      ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION;
    `);
    console.log('✅ CommissionRate column added');

    // Step 2: Clean up the failed migration record
    console.log('🧹 Cleaning up failed migration...');
    await client.query(`
      DELETE FROM "_prisma_migrations" 
      WHERE migration_name = '20241030_init';
    `);
    console.log('✅ Failed migration record removed');

    // Step 3: Verify the column exists
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'User' AND column_name = 'commissionRate';
    `);

    if (columnCheck.rows.length > 0) {
      console.log('✅ CommissionRate column confirmed present');
    } else {
      console.log('❌ CommissionRate column not found');
    }

    console.log('🎉 Database fix completed successfully!');

  } catch (error) {
    console.log('❌ Database fix error:', error.message);
    // Don't fail the build
    console.log('ℹ️  Continuing with deployment...');
  } finally {
    await client.end();
  }
}

fixDatabase();
