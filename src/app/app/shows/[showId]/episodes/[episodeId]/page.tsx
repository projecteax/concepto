'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserHeader from '@/components/UserHeader';
import { useParams } from 'next/navigation';

export default function EpisodeDetailPage() {
  const params = useParams();
  const showId = params.showId as string;
  const episodeId = params.episodeId as string;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <UserHeader />
        <ConceptoApp initialView="episode-detail" showId={showId} episodeId={episodeId} />
      </div>
    </ProtectedRoute>
  );
}
