const { PrismaClient } = require('@prisma/client');

async function cleanupMigrations() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🧹 Cleaning up failed migrations...');
    
    // Remove failed migration records
    await prisma.$executeRaw`DELETE FROM "_prisma_migrations" WHERE migration_name = '20241030_init'`;
    
    console.log('✅ Failed migrations cleaned up successfully');
    
    // Add the commissionRate column if it doesn't exist
    console.log('🔧 Adding commissionRate column if missing...');
    await prisma.$executeRaw`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "commissionRate" DOUBLE PRECISION DEFAULT 40.0`;
    
    console.log('✅ CommissionRate column added successfully');
    
  } catch (error) {
    console.log('ℹ️  Migration cleanup completed (some operations may have been skipped):', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupMigrations();
