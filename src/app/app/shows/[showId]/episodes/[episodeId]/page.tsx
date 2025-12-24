'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import { useParams } from 'next/navigation';

export default function EpisodeDetailPage() {
  const params = useParams();
  const showId = params.showId as string;
  const episodeId = params.episodeId as string;

  return <ConceptoApp initialView="episode-detail" showId={showId} episodeId={episodeId} />;
}
