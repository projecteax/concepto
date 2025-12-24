/* eslint-disable @next/next/no-img-element */
'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

type AppBreadcrumbHeaderProps = {
  /** Breadcrumb segments, e.g. Show / Episodes / Episode Name */
  items: BreadcrumbItem[];
  /** If set, renders a left-arrow that navigates to this href (one level up). */
  backHref?: string;
  /** Optional cover image used as a banner background. */
  coverImageUrl?: string;
  /** Optional logo shown to the left of breadcrumbs on larger screens. */
  logoUrl?: string;
  /** Optional right-side slot for actions. */
  actions?: React.ReactNode;
  /** Optional subheading text displayed below breadcrumbs (desktop). */
  subtitle?: string;
  /** Optional title area (rendered below breadcrumbs). Useful for inline editing in details pages. */
  title?: React.ReactNode;
  className?: string;
};

export function AppBreadcrumbHeader({
  items,
  backHref,
  coverImageUrl,
  logoUrl,
  actions,
  subtitle,
  title,
  className,
}: AppBreadcrumbHeaderProps) {
  const last = useMemo(() => items[items.length - 1], [items]);

  return (
    <div className={cn('border-b', className)}>
      <div className="relative">
        {/* Background */}
        {coverImageUrl ? (
          <div className="absolute inset-0">
            <div
              className="h-full w-full bg-center bg-cover"
              style={{ backgroundImage: `url(${coverImageUrl})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/40 to-black/15" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-purple-50" />
        )}

        {/* Content (in normal flow, no absolute positioning) */}
        <div className={cn('relative mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8', coverImageUrl ? 'py-5 sm:py-7' : 'py-4 sm:py-5')}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {backHref ? (
                <Button
                  asChild
                  variant="secondary"
                  size="icon"
                  className={cn(
                    'h-9 w-9 shrink-0',
                    coverImageUrl ? 'bg-white/15 text-white border-white/20 hover:bg-white/25' : 'bg-background',
                  )}
                  aria-label="Back"
                  title="Back"
                >
                  <Link href={backHref}>
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}

              {logoUrl ? (
                <div className={cn('hidden sm:flex h-9 w-9 rounded-md overflow-hidden border', coverImageUrl ? 'border-white/20 bg-white/10' : 'border-border bg-background')}>
                  <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                </div>
              ) : null}

              <nav className="min-w-0">
                <ol className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {items.map((it, idx) => {
                    const isLast = idx === items.length - 1;
                    const content = it.href && !isLast ? (
                      <Link
                        href={it.href}
                        className={cn(
                          'truncate rounded px-1 py-0.5 transition-colors',
                          coverImageUrl ? 'text-white/85 hover:text-white hover:bg-white/10' : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                        )}
                      >
                        {it.label}
                      </Link>
                    ) : (
                      <span
                        className={cn(
                          'truncate px-1 py-0.5',
                          isLast
                            ? coverImageUrl
                              ? 'text-white font-semibold'
                              : 'text-foreground font-semibold'
                            : coverImageUrl
                              ? 'text-white/75'
                              : 'text-muted-foreground',
                        )}
                        title={it.label}
                      >
                        {it.label}
                      </span>
                    );

                    return (
                      <li key={`${it.label}-${idx}`} className="min-w-0 flex items-center gap-2">
                        {content}
                        {!isLast ? <span className={cn(coverImageUrl ? 'text-white/55' : 'text-muted-foreground')}>/</span> : null}
                      </li>
                    );
                  })}
                </ol>

                {subtitle ? (
                  <div className={cn('mt-1 text-xs', coverImageUrl ? 'text-white/75' : 'text-muted-foreground')}>{subtitle}</div>
                ) : null}
              </nav>
            </div>

            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>

          {title ? <div className={cn('mt-3', coverImageUrl ? 'text-white' : 'text-foreground')}>{title}</div> : null}

          {last?.label ? <h1 className="sr-only">{last.label}</h1> : null}
        </div>
      </div>
    </div>
  );
}


