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
    
    // Generate a secure API key
    const apiKey = `ck_${randomBytes(32).toString('hex')}`;
    
    // For now, we'll use a placeholder userId
    // In production, get this from authenticated user session
    const userId = 'system'; // TODO: Get from authenticated user
    
    // Store API key in Firestore
    const apiKeysRef = collection(db, 'apiKeys');
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
        key: apiKey, // Only returned once - user must save it
        name,
        createdAt: new Date().toISOString(),
      },
      warning: 'Save this API key now - it will not be shown again!',
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
        name: data.name,
        isActive: data.isActive,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
        lastUsedAt: data.lastUsedAt?.toDate?.()?.toISOString() || null,
        // Don't return the actual key for security
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

