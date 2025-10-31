const { Client } = require('pg');

async function fixDatabase() {
  console.log('🔧 STARTING DATABASE FIX SCRIPT...');
  console.log('📍 Current working directory:', process.cwd());
  console.log('🌐 DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('🏗️  NODE_ENV:', process.env.NODE_ENV);
  
  if (!process.env.DATABASE_URL) {
    console.log('❌ DATABASE_URL not found, exiting...');
    process.exit(1);
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  try {
    console.log('🔌 Attempting to connect to database...');
    await client.connect();
    console.log('✅ Successfully connected to database');

    // Step 1: Check if migrations table exists
    console.log('🔍 Checking for _prisma_migrations table...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '_prisma_migrations'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('📋 _prisma_migrations table found');
      
      // Check for failed migrations
      const failedMigrations = await client.query(`
        SELECT migration_name, started_at, finished_at 
        FROM "_prisma_migrations" 
        WHERE finished_at IS NULL;
      `);
      
      console.log(`🔍 Found ${failedMigrations.rows.length} failed migrations`);
      failedMigrations.rows.forEach(row => {
        console.log(`   - ${row.migration_name} (started: ${row.started_at})`);
      });

      // Clean up ALL migration records
      console.log('🧹 Cleaning up all migration records...');
      const deleteResult = await client.query(`DELETE FROM "_prisma_migrations"`);
      console.log(`✅ Deleted ${deleteResult.rowCount} migration records`);
    } else {
      console.log('ℹ️  _prisma_migrations table does not exist');
    }

    // Step 2: Check if User table exists
    console.log('🔍 Checking User table...');
    const userTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'User'
      );
    `);

    if (userTableCheck.rows[0].exists) {
      console.log('👤 User table found');
      
      // Check if commissionRate column exists
      const columnCheck = await client.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'User' AND column_name = 'commissionRate';
      `);

      if (columnCheck.rows.length === 0) {
        console.log('🔧 Adding commissionRate column...');
        await client.query(`
          ALTER TABLE "User" 
          ADD COLUMN "commissionRate" DOUBLE PRECISION;
        `);
        console.log('✅ CommissionRate column added');
      } else {
        console.log('✅ CommissionRate column already exists');
      }
    } else {
      console.log('ℹ️  User table does not exist yet');
    }

    console.log('🎉 DATABASE FIX COMPLETED SUCCESSFULLY!');

  } catch (error) {
    console.log('❌ Database fix error:', error.message);
    console.log('📋 Error details:', error);
    // Don't fail the build - let it continue
    console.log('ℹ️  Continuing with deployment despite error...');
  } finally {
    try {
      await client.end();
      console.log('🔌 Database connection closed');
    } catch (closeError) {
      console.log('⚠️  Error closing connection:', closeError.message);
    }
  }
}

console.log('🚀 EXECUTING DATABASE FIX...');
fixDatabase().then(() => {
  console.log('✅ Fix script execution completed');
}).catch((error) => {
  console.log('❌ Fix script execution failed:', error.message);
});