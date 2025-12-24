'use client';

import { ConceptoApp } from '@/components/ConceptoApp';

export default function PublicShowsPage() {
  return <ConceptoApp initialView="shows" isPublicMode={true} />;
}
