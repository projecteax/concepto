'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AVPreviewLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Hide the parent layout's topbar - check multiple times to catch it when it renders
    const hideTopbar = () => {
      // Try various selectors
      const selectors = [
        'header',
        '[role="banner"]',
        'nav',
        '[class*="AppTopbar"]',
        '[class*="topbar"]',
        '[class*="Topbar"]',
        'main > div > header',
        'main > header',
      ];
      
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const htmlEl = el as HTMLElement;
          if (htmlEl.offsetHeight > 0 || htmlEl.offsetWidth > 0) {
            htmlEl.style.display = 'none';
            htmlEl.style.visibility = 'hidden';
            htmlEl.style.height = '0';
            htmlEl.style.margin = '0';
            htmlEl.style.padding = '0';
          }
        });
      });
      
      // Also hide the main element's padding
      const main = document.querySelector('main');
      if (main) {
        const mainEl = main as HTMLElement;
        mainEl.style.marginTop = '0';
        mainEl.style.paddingTop = '0';
        mainEl.style.minHeight = '100vh';
        mainEl.style.height = '100vh';
      }
    };

    // Hide immediately
    hideTopbar();
    
    // Hide after a short delay to catch late-rendered elements
    const timeout1 = setTimeout(hideTopbar, 100);
    const timeout2 = setTimeout(hideTopbar, 500);
    
    // Also watch for DOM changes
    const observer = new MutationObserver(hideTopbar);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isLoading && !user) {
      router.push('/login');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center text-white fixed inset-0 z-[99999]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect to login
  }

  return (
    <div className="h-screen w-screen bg-black overflow-hidden fixed inset-0 z-[99999]">
      <style jsx global>{`
        header,
        [role="banner"],
        nav[class*="topbar"],
        [class*="AppTopbar"],
        [class*="topbar"] {
          display: none !important;
        }
        main {
          margin-top: 0 !important;
          padding-top: 0 !important;
          min-height: 100vh !important;
          height: 100vh !important;
        }
        body {
          overflow: hidden;
        }
      `}</style>
      {children}
    </div>
  );
}
