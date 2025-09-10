import { ConceptoApp } from '@/components/ConceptoApp';
import ProtectedRoute from '@/components/ProtectedRoute';
import UserHeader from '@/components/UserHeader';

export default function AppPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <UserHeader />
        <ConceptoApp />
      </div>
    </ProtectedRoute>
  );
}
