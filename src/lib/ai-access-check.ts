import { NextRequest, NextResponse } from 'next/server';
import { requireApiKey, checkAiAccess } from './api-auth';

/**
 * Helper function to check AI access in API routes
 * Returns null if check passed, or a NextResponse with error if access denied
 * This is an optional safety check - frontend should handle the main check
 */
export async function checkAiAccessInRoute(request: NextRequest): Promise<NextResponse | null> {
  try {
    // Try to get userId from API key or headers
    let userId: string | null = null;
    try {
      const apiKeyAuth = await requireApiKey(request);
      userId = apiKeyAuth.userId;
    } catch {
      // If no API key, try to get from headers (for internal API calls)
      const userIdHeader = request.headers.get('X-User-Id');
      if (userIdHeader) {
        userId = userIdHeader;
      }
    }
    
    // If we have a userId, check AI access (safety check - frontend should prevent this)
    if (userId) {
      const hasAccess = await checkAiAccess(userId);
      if (!hasAccess) {
        return NextResponse.json(
          { error: 'You don\'t have permissions to use AI features on this platform.' },
          { status: 403 }
        );
      }
    }
    // If no userId, allow (frontend should handle the check)
    return null;
  } catch (error) {
    // On error, allow (don't break existing functionality)
    console.error('Error checking AI access:', error);
    return null;
  }
}
