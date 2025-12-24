'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import { useParams } from 'next/navigation';

export default function PublicGeneralIdeasPage() {
  const params = useParams();
  const showId = params.showId as string;

  return <ConceptoApp initialView="general-ideas" showId={showId} isPublicMode={true} />;
}


