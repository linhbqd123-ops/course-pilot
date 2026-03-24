#!/usr/bin/env node

// Quick test script to verify configuration and basic functionality

console.log('🧪 Testing Browser Agent Setup...\n');

try {
  console.log('1️⃣ Testing basic imports...');

  // Test basic Node.js functionality
  console.log('✅ Node.js working');

  // Test file system
  const fs = await import('fs');
  console.log('✅ File system access working');

  // Test config loading
  console.log('2️⃣ Testing configuration...');
  const { loadConfig } = await import('./dist/config/index.js');
  const config = loadConfig();
  console.log('✅ Config loaded');
  console.log(`   - Providers: ${Object.keys(config.llm.providers).join(', ')}`);

  console.log('\n🎉 Basic setup test passed!');
  console.log('\n💡 Ready to run: node main.js');

} catch (error) {
  console.error('❌ Test failed:', error.message);
  console.log('\n🔧 Fix steps:');
  console.log('   1. npm install');
  console.log('   2. npm run build');
  console.log('   3. Check .env file');
}