'use client';

import { usePathname } from 'next/navigation';

/**
 * Returns the base route prefix used by the app.
 * - "/public" for public share pages
 * - "/app" for authenticated app pages
 */
export function useBasePath(): '/app' | '/public' {
  const pathname = usePathname();
  return pathname.startsWith('/public') ? '/public' : '/app';
}


