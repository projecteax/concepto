'use client';

import { ConceptoApp } from '@/components/ConceptoApp';
import { useParams } from 'next/navigation';

export default function PublicEpisodesPage() {
  const params = useParams();
  const showId = params.showId as string;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Concepto - Public View</h1>
            <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
              Public Access
            </span>
          </div>
          <a
            href="/login"
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Login to Edit
          </a>
        </div>
      </div>
      <ConceptoApp initialView="episodes" showId={showId} isPublicMode={true} />
    </div>
  );
}
