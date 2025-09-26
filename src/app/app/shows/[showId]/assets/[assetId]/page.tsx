'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserHeader from '@/components/UserHeader';
import { useParams } from 'next/navigation';

export default function AssetDetailPage() {
  const params = useParams();
  const showId = params.showId as string;
  const assetId = params.assetId as string;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <UserHeader />
        <ConceptoApp initialView="asset-detail" showId={showId} assetId={assetId} />
      </div>
    </ProtectedRoute>
  );
}
