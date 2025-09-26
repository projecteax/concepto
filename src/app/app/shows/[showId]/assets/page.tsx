'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserHeader from '@/components/UserHeader';
import { useParams, useSearchParams } from 'next/navigation';

export default function AssetsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const showId = params.showId as string;
  const category = searchParams.get('category') as 'character' | 'location' | 'gadget' | 'texture' | 'background' | 'vehicle' | 'all' || 'all';

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <UserHeader />
        <ConceptoApp initialView="global-assets" showId={showId} category={category} />
      </div>
    </ProtectedRoute>
  );
}
