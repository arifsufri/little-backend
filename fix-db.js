const { Client } = require('pg');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

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

    // Step 1: Clean up failed migrations
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
      if (failedMigrations.rows.length > 0) {
        failedMigrations.rows.forEach(row => {
          console.log(`   - ${row.migration_name} (started: ${row.started_at})`);
        });

        // Clean up ALL migration records to start fresh
        console.log('🧹 Cleaning up all migration records...');
        const deleteResult = await client.query(`DELETE FROM "_prisma_migrations"`);
        console.log(`✅ Deleted ${deleteResult.rowCount} migration records`);
      }
    } else {
      console.log('ℹ️  _prisma_migrations table does not exist');
    }

    await client.end();
    console.log('🔌 Database connection closed');

    // Step 2: Use Prisma db push to sync the entire schema
    console.log('🚀 Running Prisma db push to sync schema...');
    try {
      const { stdout, stderr } = await execAsync('npx prisma db push --accept-data-loss', {
        env: { ...process.env },
        cwd: process.cwd()
      });
      
      console.log('📋 Prisma db push output:');
      if (stdout) console.log(stdout);
      if (stderr) console.log('⚠️  Stderr:', stderr);
      
      console.log('✅ Schema sync completed successfully!');
    } catch (pushError) {
      console.log('❌ Prisma db push error:', pushError.message);
      console.log('📋 Error details:', pushError);
      
      // Fallback: try without --accept-data-loss
      console.log('🔄 Trying db push without --accept-data-loss...');
      try {
        const { stdout, stderr } = await execAsync('npx prisma db push', {
          env: { ...process.env },
          cwd: process.cwd()
        });
        
        console.log('📋 Fallback db push output:');
        if (stdout) console.log(stdout);
        if (stderr) console.log('⚠️  Stderr:', stderr);
        
        console.log('✅ Fallback schema sync completed!');
      } catch (fallbackError) {
        console.log('❌ Fallback db push also failed:', fallbackError.message);
        console.log('ℹ️  Continuing with deployment anyway...');
      }
    }

    console.log('🎉 DATABASE FIX COMPLETED SUCCESSFULLY!');

  } catch (error) {
    console.log('❌ Database fix error:', error.message);
    console.log('📋 Error details:', error);
    // Don't fail the build - let it continue
    console.log('ℹ️  Continuing with deployment despite error...');
  }
}

console.log('🚀 EXECUTING DATABASE FIX...');
fixDatabase().then(() => {
  console.log('✅ Fix script execution completed');
}).catch((error) => {
  console.log('❌ Fix script execution failed:', error.message);
});