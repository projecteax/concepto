'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import { useParams } from 'next/navigation';

export default function EpisodeIdeasPage() {
  const params = useParams();
  const showId = params.showId as string;

  return <ConceptoApp initialView="episode-ideas" showId={showId} />;
}


