import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { randomBytes } from 'crypto';

/**
 * POST /api/external/api-keys
 * 
 * Create a new API key (requires user authentication)
 * 
 * Body:
 * {
 *   "name": "Blender Plugin Key"
 * }
 * 
 * Returns:
 * {
 *   "success": true,
 *   "data": {
 *     "id": "key-id",
 *     "key": "generated-api-key",
 *     "name": "Blender Plugin Key",
 *     "createdAt": "2024-01-01T00:00:00Z"
 *   }
 * }
 * 
 * NOTE: This endpoint should be protected by user authentication, not API key
 * For now, we'll use a simple approach - in production, add proper user auth
 */
export async function POST(request: NextRequest) {
  try {
    // For creating API keys, we need user authentication, not API key
    // This is a simplified version - in production, add proper user auth
    const body = await request.json();
    const { name } = body;
    
    if (!name) {
      return NextResponse.json(
        { error: 'API key name is required', code: 'VALIDATION_ERROR' },
        { status: 400 }
      );
    }
    
    // For now, we'll use a placeholder userId
    // In production, get this from authenticated user session
    const userId = 'system'; // TODO: Get from authenticated user
    
    // Check if an active API key already exists for this user
    const apiKeysRef = collection(db, 'apiKeys');
    const q = query(apiKeysRef, where('userId', '==', userId), where('isActive', '==', true));
    const querySnapshot = await getDocs(q);
    
    // If an active key exists, return it instead of creating a new one
    if (!querySnapshot.empty) {
      const existingKey = querySnapshot.docs[0];
      const keyData = existingKey.data();
      
      return NextResponse.json({
        success: true,
        data: {
          id: existingKey.id,
          key: keyData.key, // Return the existing key
          name: keyData.name,
          createdAt: keyData.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        },
        message: 'Using existing API key',
      });
    }
    
    // No active key exists, generate a new one
    const apiKey = `ck_${randomBytes(32).toString('hex')}`;
    
    // Store API key in Firestore
    const docRef = await addDoc(apiKeysRef, {
      key: apiKey,
      userId,
      name,
      isActive: true,
      createdAt: Timestamp.now(),
      lastUsedAt: null,
    });
    
    return NextResponse.json({
      success: true,
      data: {
        id: docRef.id,
        key: apiKey,
        name,
        createdAt: new Date().toISOString(),
      },
      message: 'New API key created',
    });
  } catch (error: unknown) {
    console.error('Error creating API key:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR', details: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/external/api-keys
 * 
 * List all API keys for the current user
 * (Requires user authentication, not API key)
 */
export async function GET(_request: NextRequest) {
  try {
    // For listing API keys, we need user authentication
    // This is a simplified version - in production, add proper user auth
    const userId = 'system'; // TODO: Get from authenticated user
    
    const apiKeysRef = collection(db, 'apiKeys');
    const q = query(apiKeysRef, where('userId', '==', userId));
    const querySnapshot = await getDocs(q);
    
    const keys = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        key: data.key, // Return the actual key (user requested this for convenience)
        name: data.name,
        isActive: data.isActive,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        lastUsedAt: data.lastUsedAt?.toDate?.()?.toISOString() || null,
      };
    });
    
    return NextResponse.json({
      success: true,
      data: keys,
    });
  } catch (error: unknown) {
    console.error('Error listing API keys:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR', details: errorMessage },
      { status: 500 }
    );
  }
}

