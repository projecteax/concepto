import { initializeFirebaseCollections } from './firebase-setup';

export async function setupDemoData() {
  try {
    console.log('Setting up demo data...');
    await initializeFirebaseCollections();
    console.log('Demo data setup completed!');
  } catch (error) {
    console.error('Error setting up demo data:', error);
  }
}
