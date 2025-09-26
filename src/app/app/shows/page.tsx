'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserHeader from '@/components/UserHeader';

export default function ShowsPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <UserHeader />
        <ConceptoApp initialView="shows" />
      </div>
    </ProtectedRoute>
  );
}
