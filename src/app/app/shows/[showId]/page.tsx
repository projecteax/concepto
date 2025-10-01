'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserHeader from '@/components/UserHeader';
import { useParams } from 'next/navigation';

export default function ShowDashboardPage() {
  const params = useParams();
  const showId = params.showId as string;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <UserHeader />
        <ConceptoApp initialView="dashboard" showId={showId} />
      </div>
    </ProtectedRoute>
  );
}
