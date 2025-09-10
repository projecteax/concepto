// Manual Firebase setup script
// Run this once to initialize your Firebase collections with proper structure

import { initializeFirebaseCollections } from './firebase-setup';

// This function can be called from the browser console or a setup page
export async function runFirebaseSetup() {
  try {
    console.log('🚀 Starting Firebase setup...');
    await initializeFirebaseCollections();
    console.log('✅ Firebase setup completed successfully!');
    console.log('📊 Your collections are now ready with proper structure:');
    console.log('   - shows');
    console.log('   - globalAssets');
    console.log('   - episodes');
    console.log('   - assetConcepts');
    return true;
  } catch (error) {
    console.error('❌ Firebase setup failed:', error);
    return false;
  }
}

// Make it available globally for console access
if (typeof window !== 'undefined') {
  (window as typeof window & { setupFirebase: typeof runFirebaseSetup }).setupFirebase = runFirebaseSetup;
}
