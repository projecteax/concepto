import { Episode, EpisodeAccess, PermissionRole, Show, ShowAccess, UserProfile } from '@/types';

export const ADMIN_USERNAMES = ['adrian', 'lukasz'];
export const ADMIN_EMAILS = ['adrian@concepto.local', 'lukasz@concepto.local'];

export const isAdminUser = (user: UserProfile | null): boolean => {
  return Boolean(user && user.role === 'admin');
};

export const getShowRole = (
  user: UserProfile | null,
  show: Show | null | undefined,
  showAccess: ShowAccess[],
  episodeAccess?: EpisodeAccess[],
  episodes?: Episode[],
): PermissionRole | null => {
  if (!user || !show) return null;
  if (isAdminUser(user)) return 'editor';
  if (show.ownerId && show.ownerId === user.id) return 'editor';
  
  // Check for explicit show-level access
  const showAccessEntry = showAccess.find(entry => entry.showId === show.id && entry.userId === user.id);
  if (showAccessEntry) return showAccessEntry.role;
  
  // If no show-level access, check if user has episode-level access
  // If they only have episode access, they should have restricted show access (viewer or none)
  // EpisodeAccess already contains showId, so we don't need to look up episodes
  if (episodeAccess) {
    const hasEpisodeAccess = episodeAccess.some(entry => 
      entry.showId === show.id && entry.userId === user.id
    );
    if (hasEpisodeAccess) {
      // User has episode access but no show access - restrict to viewer level for show
      return 'viewer';
    }
  }
  
  return null;
};

export const getEpisodeRole = (
  user: UserProfile | null,
  episode: Episode | null | undefined,
  show: Show | null | undefined,
  showAccess: ShowAccess[],
  episodeAccess: EpisodeAccess[],
): PermissionRole | null => {
  if (!user || !episode) return null;
  if (isAdminUser(user)) return 'editor';
  if (episode.ownerId && episode.ownerId === user.id) return 'editor';
  const episodeEntry = episodeAccess.find(entry => entry.episodeId === episode.id && entry.userId === user.id);
  if (episodeEntry) return episodeEntry.role;
  return getShowRole(user, show, showAccess);
};

export const canView = (role: PermissionRole | null): boolean => {
  return role === 'editor' || role === 'commenter' || role === 'viewer';
};

export const canComment = (role: PermissionRole | null): boolean => {
  return role === 'editor' || role === 'commenter';
};

export const canEdit = (role: PermissionRole | null): boolean => {
  return role === 'editor';
};

/**
 * Check if user has ONLY episode-level access (no show-level access)
 * This means they can only work within episodes, not on show-level features
 */
export const hasOnlyEpisodeAccess = (
  user: UserProfile | null,
  show: Show | null | undefined,
  showAccess: ShowAccess[],
  episodeAccess?: EpisodeAccess[],
): boolean => {
  if (!user || !show) return false;
  if (isAdminUser(user)) return false;
  if (show.ownerId && show.ownerId === user.id) return false;
  
  // Check if user has explicit show-level access
  const hasShowAccess = showAccess.some(entry => entry.showId === show.id && entry.userId === user.id);
  if (hasShowAccess) return false;
  
  // Check if user has episode-level access
  if (episodeAccess) {
    const hasEpisodeAccess = episodeAccess.some(entry => 
      entry.showId === show.id && entry.userId === user.id
    );
    return hasEpisodeAccess;
  }
  
  return false;
};
