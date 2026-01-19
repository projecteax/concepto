import { db } from './firebase';
import { collection, doc, getDocs, updateDoc, query, where, Timestamp, getDoc } from 'firebase/firestore';
import { UserProfile } from '@/types';

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

/**
 * Get user profile by userId
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId));
    if (!userDoc.exists()) {
      return null;
    }
    const data = userDoc.data();
    return {
      id: userDoc.id,
      ...data,
      createdAt: data.createdAt?.toDate?.() || new Date(),
      updatedAt: data.updatedAt?.toDate?.() || new Date(),
      lastActiveAt: data.lastActiveAt?.toDate?.() || undefined,
    } as UserProfile;
  } catch (error) {
    console.error('Error getting user profile:', error);
    return null;
  }
}

/**
 * Check if user has AI access (works with API keys or user IDs)
 */
export async function checkAiAccess(userId: string): Promise<boolean> {
  try {
    const user = await getUserProfile(userId);
    if (!user) return false;
    // Default to true if not set (backward compatibility)
    return user.aiAccessEnabled !== false;
  } catch (error) {
    console.error('Error checking AI access:', error);
    return false;
  }
}

