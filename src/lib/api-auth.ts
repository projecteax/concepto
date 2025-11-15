import { db } from './firebase';
import { collection, doc, getDocs, updateDoc, query, where, Timestamp } from 'firebase/firestore';

export interface ApiKey {
  id: string;
  key: string;
  userId: string;
  name: string;
  createdAt: Date;
  lastUsedAt?: Date;
  isActive: boolean;
}

/**
 * Validates an API key and returns the associated user ID
 */
export async function validateApiKey(apiKey: string): Promise<{ userId: string; keyId: string } | null> {
  try {
    // API keys are stored in Firestore collection 'apiKeys'
    // We need to query by the key value
    // For security, keys are hashed in the database
    
    // For now, we'll use a simple lookup
    // In production, you should hash the keys and use a proper lookup
    const apiKeysRef = collection(db, 'apiKeys');
    const q = query(apiKeysRef, where('key', '==', apiKey), where('isActive', '==', true));
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      return null;
    }
    
    const keyDoc = querySnapshot.docs[0];
    const keyData = keyDoc.data();
    
    // Update last used timestamp
    await updateDoc(doc(db, 'apiKeys', keyDoc.id), {
      lastUsedAt: Timestamp.now(),
    });
    
    return {
      userId: keyData.userId,
      keyId: keyDoc.id,
    };
  } catch (error) {
    console.error('Error validating API key:', error);
    return null;
  }
}

/**
 * Middleware function for API routes to validate API keys
 */
export async function requireApiKey(request: Request): Promise<{ userId: string; keyId: string }> {
  const apiKey = request.headers.get('X-API-Key') || request.headers.get('Authorization')?.replace('Bearer ', '');
  
  if (!apiKey) {
    throw new Error('API key required');
  }
  
  const validation = await validateApiKey(apiKey);
  
  if (!validation) {
    throw new Error('Invalid API key');
  }
  
  return validation;
}

