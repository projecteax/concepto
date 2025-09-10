import Link from 'next/link';

export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          ✅ Concepto App is Working!
        </h1>
        <p className="text-gray-600 mb-4">
          If you can see this page, the basic Next.js deployment is working.
        </p>
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-2">Environment Variables Status:</h2>
          <div className="text-left space-y-2">
            <p>Firebase API Key: {process.env.NEXT_PUBLIC_FIREBASE_API_KEY ? '✅ Set' : '❌ Missing'}</p>
            <p>Firebase Project ID: {process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ? '✅ Set' : '❌ Missing'}</p>
            <p>Gemini API Key: {process.env.NEXT_PUBLIC_GEMINI_API_KEY ? '✅ Set' : '❌ Missing'}</p>
            <p>R2 Bucket: {process.env.NEXT_PUBLIC_R2_BUCKET ? '✅ Set' : '❌ Missing'}</p>
          </div>
        </div>
        <Link 
          href="/" 
          className="inline-block mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
        >
          Go to Main App
        </Link>
      </div>
    </div>
  );
}
