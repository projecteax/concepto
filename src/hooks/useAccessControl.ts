import { useEffect, useMemo, useState } from 'react';
import { Episode, EpisodeAccess, Show, ShowAccess, UserProfile } from '@/types';
import { episodeAccessService, showAccessService } from '@/lib/firebase-services';
import { canComment, canEdit, canView, getEpisodeRole, getShowRole, hasOnlyEpisodeAccess, isAdminUser } from '@/lib/access-control';
import { useAuth } from '@/contexts/AuthContext';

interface UseAccessControlOptions {
  shows: Show[];
  episodes: Episode[];
}

export function useAccessControl({ shows, episodes }: UseAccessControlOptions) {
  const { user } = useAuth();
  const [showAccess, setShowAccess] = useState<ShowAccess[]>([]);
  const [episodeAccess, setEpisodeAccess] = useState<EpisodeAccess[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadAccess = async (currentUser: UserProfile | null) => {
      if (!currentUser) {
        if (isMounted) {
          setShowAccess([]);
          setEpisodeAccess([]);
          setLoading(false);
        }
        return;
      }
      try {
        const [showAccessData, episodeAccessData] = await Promise.all([
          showAccessService.getByUser(currentUser.id),
          episodeAccessService.getByUser(currentUser.id),
        ]);
        if (isMounted) {
          setShowAccess(showAccessData);
          setEpisodeAccess(episodeAccessData);
        }
      } catch (error) {
        console.error('Failed to load access rules:', error);
        if (isMounted) {
          setShowAccess([]);
          setEpisodeAccess([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    setLoading(true);
    loadAccess(user);
    return () => {
      isMounted = false;
    };
  }, [user]);

  const visibleShows = useMemo(() => {
    if (!user) return [];
    if (isAdminUser(user)) return shows;
    
    // Shows user owns
    const ownedShowIds = new Set(shows.filter(show => show.ownerId === user.id).map(show => show.id));
    
    // Shows user has explicit show-level access to
    const accessibleShowIds = new Set(showAccess.filter(entry => entry.userId === user.id).map(entry => entry.showId));
    
    // Shows that contain episodes user has access to
    // EpisodeAccess already contains showId, so we don't need to look up episodes
    const episodeAccessibleShowIds = new Set(
      episodeAccess
        .filter(entry => entry.userId === user.id)
        .map(entry => entry.showId)
    );
    
    // Combine all accessible show IDs
    const allAccessibleShowIds = new Set([
      ...Array.from(ownedShowIds),
      ...Array.from(accessibleShowIds),
      ...Array.from(episodeAccessibleShowIds),
    ]);
    
    return shows.filter(show => allAccessibleShowIds.has(show.id));
  }, [shows, showAccess, episodeAccess, user]);

  const getShowAccessRole = (show: Show | null | undefined) => {
    return getShowRole(user, show, showAccess, episodeAccess, episodes);
  };

  const getEpisodeAccessRole = (episode: Episode | null | undefined, show?: Show | null) => {
    return getEpisodeRole(user, episode, show, showAccess, episodeAccess);
  };

  const getVisibleEpisodes = (show: Show | null | undefined) => {
    if (!show) return [];
    if (!user) return [];
    if (isAdminUser(user)) return episodes.filter(ep => ep.showId === show.id);
    return episodes.filter(ep => {
      if (ep.showId !== show.id) return false;
      const role = getEpisodeRole(user, ep, show, showAccess, episodeAccess);
      return canView(role);
    });
  };

  const hasOnlyEpisodeLevelAccess = (show: Show | null | undefined) => {
    return hasOnlyEpisodeAccess(user, show, showAccess, episodeAccess);
  };

  return {
    loading,
    showAccess,
    episodeAccess,
    visibleShows,
    getShowAccessRole,
    getEpisodeAccessRole,
    getVisibleEpisodes,
    hasOnlyEpisodeLevelAccess,
    canView,
    canComment,
    canEdit,
    isAdmin: user ? isAdminUser(user) : false,
  };
}
