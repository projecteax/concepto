import { useAuth } from '@/contexts/AuthContext';
import { hasAiAccess } from '@/lib/access-control';

/**
 * Hook to check if the current user has AI access
 * Returns true if user has access, false otherwise
 */
export function useAiAccess(): boolean {
  const { user } = useAuth();
  return hasAiAccess(user);
}

/**
 * Check AI access and show popup if denied
 * Returns true if access granted, false if denied
 */
export function checkAiAccessWithPopup(user: { aiAccessEnabled?: boolean } | null): boolean {
  // Default to true if not set (backward compatibility)
  const hasAccess = user?.aiAccessEnabled !== false;
  
  if (!hasAccess) {
    alert('You don\'t have permissions to use AI features on this platform.');
    return false;
  }
  
  return true;
}
