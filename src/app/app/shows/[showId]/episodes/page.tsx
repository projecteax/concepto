'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import { useParams } from 'next/navigation';

export default function EpisodesPage() {
  const params = useParams();
  const showId = params.showId as string;

  return <ConceptoApp initialView="episodes" showId={showId} />;
}
