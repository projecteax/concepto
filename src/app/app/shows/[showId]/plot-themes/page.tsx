'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import { useParams } from 'next/navigation';

export default function PlotThemesPage() {
  const params = useParams();
  const showId = params.showId as string;

  return <ConceptoApp initialView="plot-themes" showId={showId} />;
}


