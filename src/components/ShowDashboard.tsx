'use client';

import { useState, useEffect, useRef } from 'react';
import { Show, GlobalAsset, Episode, EpisodeIdea, GeneralIdea, PlotTheme } from '@/types';
import { 
  ArrowLeft, 
  Users, 
  MapPin, 
  Wrench, 
  Image, 
  Mountain,
  Car,
  Play,
  Plus,
  FolderOpen,
  Lightbulb,
  Edit3,
  Save,
  X,
  BookOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ShowDownloadButton } from './ShowDownloadButton';
import { useS3Upload } from '@/hooks/useS3Upload';
import { AppBreadcrumbHeader } from './AppBreadcrumbHeader';
import { useBasePath } from '@/hooks/useBasePath';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

interface ShowDashboardProps {
  show: Show;
  globalAssets: GlobalAsset[];
  episodes: Episode[];
  episodeIdeas?: EpisodeIdea[];
  generalIdeas?: GeneralIdea[];
  plotThemes?: PlotTheme[];
  onBack: () => void;
  onSelectGlobalAssets: (category?: 'character' | 'location' | 'gadget' | 'texture' | 'background' | 'vehicle' | 'all') => void;
  onSelectEpisodes: () => void;
  onSelectEpisode: (episode: Episode) => void;
  onSelectEpisodeIdeas: () => void;
  onSelectGeneralIdeas: () => void;
  onSelectPlotThemes: () => void;
  onAddGlobalAsset?: (asset: Omit<GlobalAsset, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onAddEpisode?: (episode: Omit<Episode, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onSaveShow?: (show: Show) => void | Promise<void>;
  isPublicMode?: boolean;
  isReadOnly?: boolean;
  hasOnlyEpisodeAccess?: boolean;
}

const assetIcons = {
  character: Users,
  location: MapPin,
  gadget: Wrench,
  texture: Image,
  background: Mountain,
  vehicle: Car,
};

const assetLabels = {
  character: 'Characters',
  location: 'Locations',
  gadget: 'Gadgets',
  texture: 'Textures',
  background: 'Backgrounds',
  vehicle: 'Vehicles',
};

export function ShowDashboard({
  show,
  globalAssets,
  episodes,
  episodeIdeas = [],
  generalIdeas = [],
  plotThemes = [],
  onBack,
  onSelectGlobalAssets,
  onSelectEpisodes,
  onSelectEpisode,
  onSelectEpisodeIdeas,
  onSelectGeneralIdeas,
  onSelectPlotThemes,
  onAddGlobalAsset,
  onAddEpisode,
  onSaveShow,
  isPublicMode = false,
  isReadOnly = false,
  hasOnlyEpisodeAccess = false,
}: ShowDashboardProps) {
  const readOnly = isPublicMode || isReadOnly;
  const basePath = useBasePath();
  const headerIsDark = Boolean(show.coverImageUrl);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddEpisode, setShowAddEpisode] = useState(false);
  const [newAssetName, setNewAssetName] = useState('');
  const [newAssetCategory, setNewAssetCategory] = useState<'character' | 'location' | 'gadget' | 'texture' | 'background'>('character');
  const [newEpisodeTitle, setNewEpisodeTitle] = useState('');
  const [newEpisodeNumber, setNewEpisodeNumber] = useState<number | 'intro'>(1);
  
  // Edit show state (Show Settings)
  const [showName, setShowName] = useState(show.name);
  const [showDescription, setShowDescription] = useState(show.description || '');
  const [coverImageUrl, setCoverImageUrl] = useState(show.coverImageUrl || '');
  const [logoUrl, setLogoUrl] = useState(show.logoUrl || '');
  const [seasonsCount, setSeasonsCount] = useState<number>(show.seasonsCount ?? 1);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const { uploadFile, uploadState, resetUpload } = useS3Upload();
  const [coverUploadHint, setCoverUploadHint] = useState<string | null>(null);
  const [logoUploadHint, setLogoUploadHint] = useState<string | null>(null);
  const [coverSaveStatus, setCoverSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [logoSaveStatus, setLogoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [coverSaveError, setCoverSaveError] = useState<string | null>(null);
  const [logoSaveError, setLogoSaveError] = useState<string | null>(null);
  const { user } = useAuth();

  // Sync local state when show prop changes
  useEffect(() => {
    setShowName(show.name);
    setShowDescription(show.description || '');
    setCoverImageUrl(show.coverImageUrl || '');
    setLogoUrl(show.logoUrl || '');
    setSeasonsCount(show.seasonsCount ?? 1);
  }, [show.name, show.description, show.coverImageUrl, show.logoUrl, show.seasonsCount]);

  const getAssetCount = (category: keyof typeof assetLabels) => {
    return globalAssets.filter(asset => asset.category === category).length;
  };

  const handleAddAsset = () => {
    if (newAssetName.trim()) {
      onAddGlobalAsset?.({
        showId: show.id,
        name: newAssetName.trim(),
        category: newAssetCategory,
        concepts: [],
      });
      setNewAssetName('');
      setShowAddAsset(false);
    }
  };

  const handleAddEpisode = () => {
    if (newEpisodeTitle.trim()) {
      onAddEpisode?.({
        showId: show.id,
        title: newEpisodeTitle.trim(),
        episodeNumber: newEpisodeNumber,
        characters: [],
        locations: [],
        scenes: [],
      });
      setNewEpisodeTitle('');
      setNewEpisodeNumber(1);
      setShowAddEpisode(false);
    }
  };

  const handleSaveShow = () => {
    if (onSaveShow) {
      const updatedShow: Show = {
        ...show,
        name: showName.trim(),
        description: showDescription.trim() || undefined,
        coverImageUrl: coverImageUrl.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        ...(Number.isFinite(seasonsCount) ? ({ seasonsCount } as Show) : {}),
      };
      onSaveShow(updatedShow);
    }
    setIsEditingDescription(false);
  };

  const handleCancelEdits = () => {
    setShowName(show.name);
    setShowDescription(show.description || '');
    setCoverImageUrl(show.coverImageUrl || '');
    setLogoUrl(show.logoUrl || '');
    setSeasonsCount(show.seasonsCount ?? 1);
    resetUpload();
    setIsEditingDescription(false);
  };

  const readImageSize = (file: File) =>
    new Promise<{ width: number; height: number }>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        const out = { width: img.naturalWidth, height: img.naturalHeight };
        URL.revokeObjectURL(url);
        resolve(out);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to read image size'));
      };
      img.src = url;
    });

  const handleUploadShowImage = async (file: File, kind: 'cover' | 'logo') => {
    // Soft validation + guidance (we still allow upload).
    try {
      const { width, height } = await readImageSize(file);
      const ratio = width / Math.max(1, height);
      if (kind === 'cover') {
        const okRatio = ratio >= 3 && ratio <= 5; // roughly banner-ish
        const okSize = width >= 1600 && height >= 360;
        setCoverUploadHint(
          `${width}×${height}px • ${ratio.toFixed(2)}:1` +
            (!okSize ? ' • Consider a larger image (min ~1600×360).' : '') +
            (!okRatio ? ' • Consider a wider banner (ideal ~4:1).' : ''),
        );
      } else {
        const square = Math.abs(ratio - 1) <= 0.12;
        const okSize = width >= 256 && height >= 256;
        setLogoUploadHint(
          `${width}×${height}px` +
            (!okSize ? ' • Consider at least 256×256.' : '') +
            (!square ? ' • Consider a square logo (1:1).' : ''),
        );
      }
    } catch {
      // ignore
    }
    const prefix = `shows/${show.id}/${kind}`;
    const result = await uploadFile(file, prefix);
    if (!result) return;
    if (kind === 'cover') {
      setCoverImageUrl(result.url);
      setCoverSaveStatus('saving');
      setCoverSaveError(null);
    } else {
      setLogoUrl(result.url);
      setLogoSaveStatus('saving');
      setLogoSaveError(null);
    }

    // Auto-save to DB so reload never loses it.
    if (!readOnly && onSaveShow) {
      const updatedShow: Show = {
        ...show,
        name: showName.trim(),
        description: showDescription.trim() || undefined,
        coverImageUrl: kind === 'cover' ? result.url : (coverImageUrl.trim() || undefined),
        logoUrl: kind === 'logo' ? result.url : (logoUrl.trim() || undefined),
        seasonsCount,
      };
      try {
        await onSaveShow(updatedShow);
        if (kind === 'cover') setCoverSaveStatus('saved');
        else setLogoSaveStatus('saved');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to save';
        if (kind === 'cover') {
          setCoverSaveStatus('error');
          setCoverSaveError(msg);
        } else {
          setLogoSaveStatus('error');
          setLogoSaveError(msg);
        }
      }
    } else {
      // In public mode there's no DB write; treat as idle.
      if (kind === 'cover') setCoverSaveStatus('idle');
      else setLogoSaveStatus('idle');
    }
  };

  const formatSafeDate = (d: unknown) => {
    const date = d instanceof Date ? d : null;
    if (!date || Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
  };

  const charactersCount = globalAssets.filter(a => a.category === 'character').length;
  const locationsCount = globalAssets.filter(a => a.category === 'location').length;

  return (
    <div className="min-h-screen bg-background">
      <AppBreadcrumbHeader
        coverImageUrl={show.coverImageUrl}
        logoUrl={show.logoUrl}
        backHref={`${basePath}/shows`}
        items={[{ label: show.name || 'Show' }]}
        subtitle="Show dashboard"
        title={
          <div className="min-w-0">
            <div className={cn('text-2xl sm:text-3xl font-bold truncate', headerIsDark ? 'text-white' : 'text-foreground')}>
              {show.name}
            </div>
          </div>
        }
      />

      <div className="studio-container py-6 sm:py-8">
        {/* Show Description */}
        <Card className="mb-8">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Description</CardTitle>
              <CardDescription>Short pitch, audience, premise — shown across the studio.</CardDescription>
            </div>
            {!isEditingDescription && !readOnly && onSaveShow ? (
              <Button variant="outline" size="sm" onClick={() => setIsEditingDescription(true)} className="gap-2">
                <Edit3 className="w-4 h-4" />
                Edit
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
          <div className="flex items-center justify-between mb-2">
          </div>
          {isEditingDescription && !readOnly ? (
            <div className="space-y-3">
              <Textarea
                value={showDescription}
                onChange={(e) => setShowDescription(e.target.value)}
                rows={4}
                placeholder="Enter show description..."
              />
              {uploadState.error ? <div className="text-sm text-red-600">{uploadState.error}</div> : null}
              <div className="flex items-center space-x-2">
                <Button onClick={handleSaveShow} className="gap-2">
                  <Save className="w-4 h-4" />
                  Save
                </Button>
                <Button variant="secondary" onClick={handleCancelEdits} className="gap-2">
                  <X className="w-4 h-4" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground whitespace-pre-wrap">
              {show.description || <span className="text-muted-foreground/70 italic">No description</span>}
            </p>
          )}
          </CardContent>
        </Card>

        {/* Main Navigation */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Global Assets Section - Hidden if user only has episode access */}
          {!hasOnlyEpisodeAccess && (
            <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center space-x-3">
                <FolderOpen className="w-6 h-6 text-primary" />
                <CardTitle>Global Assets</CardTitle>
              </div>
              <Button onClick={() => setShowAddAsset(true)} className="gap-2" size="sm">
                <Plus className="w-4 h-4" />
                Add Asset
              </Button>
            </CardHeader>
            <CardContent>
            <div className="flex items-center justify-between mb-6">
            </div>

            <p className="text-muted-foreground mb-6">
              Manage characters, locations, gadgets, textures, backgrounds, and vehicles that will be used across the show.
            </p>

            {/* Asset Categories */}
            <div className="space-y-3 mb-6">
              {Object.entries(assetLabels).map(([category, label]) => {
                const Icon = assetIcons[category as keyof typeof assetIcons];
                const count = getAssetCount(category as keyof typeof assetLabels);
                
                return (
                  <div
                    key={category}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors cursor-pointer"
                    onClick={() => onSelectGlobalAssets(category as 'character' | 'location' | 'gadget' | 'texture' | 'background' | 'vehicle')}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">{label}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-muted-foreground">{count} items</span>
                      <span className="text-muted-foreground">→</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={() => onSelectGlobalAssets('all')}
              className="w-full gap-2"
            >
              <FolderOpen className="w-5 h-5" />
              <span>Manage Global Assets</span>
            </Button>
            </CardContent>
          </Card>
          )}

          {/* Episodes Section */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center space-x-3">
                <Play className="w-6 h-6 text-primary" />
                <CardTitle>Episodes</CardTitle>
              </div>
              <Button onClick={() => setShowAddEpisode(true)} className="gap-2" size="sm">
                <Plus className="w-4 h-4" />
                Add Episode
              </Button>
            </CardHeader>
            <CardContent>

            <p className="text-muted-foreground mb-6">
              Create and manage episodes with scripts, character lists, and location details.
            </p>

            {/* Recent Episodes */}
            <div className="space-y-3 mb-6">
              {[...episodes].sort((a, b) => {
                if (a.episodeNumber === 'intro' && b.episodeNumber !== 'intro') return -1;
                if (a.episodeNumber !== 'intro' && b.episodeNumber === 'intro') return 1;
                if (a.episodeNumber === 'intro' && b.episodeNumber === 'intro') return 0;
                const numA = typeof a.episodeNumber === 'number' ? a.episodeNumber : 0;
                const numB = typeof b.episodeNumber === 'number' ? b.episodeNumber : 0;
                return numA - numB;
              }).slice(0, 5).map((episode) => (
                <div
                  key={episode.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent transition-colors cursor-pointer"
                  onClick={() => onSelectEpisode(episode)}
                >
                  <div>
                    <h4 className="font-medium hover:text-primary transition-colors">
                      {episode.episodeNumber === 'intro' ? 'Intro' : `Episode ${episode.episodeNumber}`}
                    </h4>
                    <p className="text-sm text-muted-foreground">{episode.title}</p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {episode.characters.length} characters
                  </span>
                </div>
              ))}
              
              {episodes.length === 0 && (
                <div className="text-center py-6 text-muted-foreground">
                  <Play className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
                  <p className="text-sm">No episodes yet</p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button onClick={onSelectEpisodes} className="w-full gap-2">
                <Play className="w-5 h-5" />
                Manage Episodes
              </Button>
              <Button onClick={onSelectEpisodeIdeas} variant="secondary" className="w-full gap-2">
                <FolderOpen className="w-5 h-5" />
                Episode Ideas
              </Button>
            </div>
            </CardContent>
          </Card>
        </div>

        {/* Ideas & Themes - Hidden if user only has episode access */}
        {!hasOnlyEpisodeAccess && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Lightbulb className="w-6 h-6 text-primary" />
                  <div>
                    <CardTitle>General Ideas</CardTitle>
                    <CardDescription>Inspiration and concepts that don&apos;t fit a specific bucket.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Button onClick={onSelectGeneralIdeas} className="w-full gap-2">
                  <Lightbulb className="w-5 h-5" />
                  Manage Ideas
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <BookOpen className="w-6 h-6 text-primary" />
                  <div>
                    <CardTitle>Plot Themes</CardTitle>
                    <CardDescription>Reusable themes that guide episode descriptions and screenplays.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-muted-foreground">
                  {plotThemes.length} {plotThemes.length === 1 ? 'theme' : 'themes'} available
                </div>
                <Button onClick={onSelectPlotThemes} className="w-full gap-2">
                  <BookOpen className="w-5 h-5" />
                  Manage Plot Themes
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Show Settings - Hidden if user only has episode access */}
        {!hasOnlyEpisodeAccess && (
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Show Settings</CardTitle>
            <CardDescription>Branding, exports, and show-level metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Show name</label>
                  <Input
                    value={showName}
                    onChange={(e) => setShowName(e.target.value)}
                    placeholder="Show name…"
                    disabled={readOnly || !onSaveShow}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Seasons</label>
                    <Input
                      type="number"
                      min={1}
                      value={seasonsCount}
                      onChange={(e) => setSeasonsCount(Math.max(1, Number(e.target.value) || 1))}
                      disabled={readOnly || !onSaveShow}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Created</label>
                    <div className="h-10 flex items-center rounded-md border bg-card px-3 text-sm text-muted-foreground">
                      {formatSafeDate(show.createdAt)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Episodes</div>
                    <div className="text-lg font-semibold">{episodes.length}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Characters</div>
                    <div className="text-lg font-semibold">{charactersCount}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Locations</div>
                    <div className="text-lg font-semibold">{locationsCount}</div>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <div className="text-xs text-muted-foreground">Assets</div>
                    <div className="text-lg font-semibold">{globalAssets.length}</div>
                  </div>
                </div>

                {!readOnly && (
                  <div className="flex flex-wrap gap-2">
                    {onSaveShow ? (
                      <>
                        <Button onClick={handleSaveShow} className="gap-2" disabled={uploadState.isUploading}>
                          <Save className="w-4 h-4" />
                          Save Settings
                        </Button>
                        <Button variant="secondary" onClick={handleCancelEdits} className="gap-2" disabled={uploadState.isUploading}>
                          <X className="w-4 h-4" />
                          Reset
                        </Button>
                      </>
                    ) : null}

                    <ShowDownloadButton
                      show={show}
                      globalAssets={globalAssets}
                      episodes={episodes}
                      episodeIdeas={episodeIdeas}
                      generalIdeas={generalIdeas}
                      plotThemes={plotThemes}
                    />
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Cover image (banner)</div>
                      <div className="text-xs text-muted-foreground">
                        Recommended: <span className="font-medium">1920×480</span> (or <span className="font-medium">2400×600</span>) • Ratio ~<span className="font-medium">4:1</span> • JPG/PNG/WebP
                      </div>
                    </div>
                    <input
                      ref={coverInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadShowImage(f, 'cover');
                        e.currentTarget.value = '';
                      }}
                      disabled={readOnly || !onSaveShow}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => coverInputRef.current?.click()}
                      disabled={uploadState.isUploading || readOnly || !onSaveShow}
                    >
                      Upload
                    </Button>
                  </div>
                  <div className="mt-3">
                    {coverImageUrl ? (
                      <div className="relative h-28 w-full overflow-hidden rounded-lg border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={coverImageUrl} alt="" className="h-full w-full object-cover" />
                        {!readOnly && onSaveShow ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCoverImageUrl('')}
                            className="absolute top-2 right-2 bg-background/80"
                          >
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="h-28 w-full rounded-lg border border-dashed bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">
                        No cover uploaded
                      </div>
                    )}
                  </div>
                  {coverUploadHint ? <div className="mt-2 text-xs text-muted-foreground">{coverUploadHint}</div> : null}
                  {!readOnly && onSaveShow ? (
                    <div className="mt-1 text-xs">
                      {coverSaveStatus === 'saving' ? (
                        <span className="text-muted-foreground">Saving…</span>
                      ) : coverSaveStatus === 'saved' ? (
                        <span className="text-muted-foreground">Saved.</span>
                      ) : coverSaveStatus === 'error' ? (
                        <span className="text-destructive">Failed to save: {coverSaveError || 'Unknown error'}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">Show logo</div>
                      <div className="text-xs text-muted-foreground">
                        Recommended: <span className="font-medium">512×512</span> (or <span className="font-medium">1024×1024</span>) • Square • PNG (transparent ok)
                      </div>
                    </div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUploadShowImage(f, 'logo');
                        e.currentTarget.value = '';
                      }}
                      disabled={readOnly || !onSaveShow}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadState.isUploading || readOnly || !onSaveShow}
                    >
                      Upload
                    </Button>
                  </div>

                  <div className="mt-3">
                    {logoUrl ? (
                      <div className="relative h-24 w-24 overflow-hidden rounded-lg border bg-muted">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                        {!readOnly && onSaveShow ? (
                          <button
                            type="button"
                            onClick={() => setLogoUrl('')}
                            className="absolute top-1 right-1 h-6 w-6 rounded-md border bg-background/80 text-xs hover:bg-background"
                            title="Remove logo"
                          >
                            ✕
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <div className="h-24 w-24 rounded-lg border border-dashed bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">
                        No logo
                      </div>
                    )}
                  </div>
                  {logoUploadHint ? <div className="mt-2 text-xs text-muted-foreground">{logoUploadHint}</div> : null}
                  {!readOnly && onSaveShow ? (
                    <div className="mt-1 text-xs">
                      {logoSaveStatus === 'saving' ? (
                        <span className="text-muted-foreground">Saving…</span>
                      ) : logoSaveStatus === 'saved' ? (
                        <span className="text-muted-foreground">Saved.</span>
                      ) : logoSaveStatus === 'error' ? (
                        <span className="text-destructive">Failed to save: {logoSaveError || 'Unknown error'}</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {uploadState.error ? <div className="text-sm text-destructive">{uploadState.error}</div> : null}
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        {/* Add Asset Modal */}
        {showAddAsset && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Asset</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Asset Name
                    </label>
                    <input
                      type="text"
                      value={newAssetName}
                      onChange={(e) => setNewAssetName(e.target.value)}
                      placeholder="Enter asset name..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <select
                      value={newAssetCategory}
                      onChange={(e) => setNewAssetCategory(e.target.value as 'character' | 'location' | 'gadget' | 'texture' | 'background')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      {Object.entries(assetLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={handleAddAsset}
                      disabled={!newAssetName.trim()}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-lg font-medium transition-colors",
                        newAssetName.trim()
                          ? "bg-indigo-600 text-white hover:bg-indigo-700"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      )}
                    >
                      Add Asset
                    </button>
                    <button
                      onClick={() => setShowAddAsset(false)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Episode Modal */}
        {showAddEpisode && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg max-w-md w-full mx-4">
              <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Episode</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Episode Title
                    </label>
                    <input
                      type="text"
                      value={newEpisodeTitle}
                      onChange={(e) => setNewEpisodeTitle(e.target.value)}
                      placeholder="Enter episode title..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Sequence Type
                    </label>
                    <select
                      value={newEpisodeNumber === 'intro' ? 'intro' : 'number'}
                      onChange={(e) => {
                        if (e.target.value === 'intro') {
                          setNewEpisodeNumber('intro');
                        } else {
                          setNewEpisodeNumber(typeof newEpisodeNumber === 'number' ? newEpisodeNumber : 1);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-2"
                    >
                      <option value="number">Number</option>
                      <option value="intro">Intro</option>
                    </select>
                  </div>
                  {newEpisodeNumber !== 'intro' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Episode Number
                      </label>
                      <input
                        type="number"
                        value={typeof newEpisodeNumber === 'number' ? newEpisodeNumber : 1}
                        onChange={(e) => setNewEpisodeNumber(parseInt(e.target.value) || 1)}
                        min="1"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  )}
                  <div className="flex space-x-3">
                    <button
                      onClick={handleAddEpisode}
                      disabled={!newEpisodeTitle.trim()}
                      className={cn(
                        "flex-1 px-4 py-2 rounded-lg font-medium transition-colors",
                        newEpisodeTitle.trim()
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-gray-100 text-gray-400 cursor-not-allowed"
                      )}
                    >
                      Add Episode
                    </button>
                    <button
                      onClick={() => setShowAddEpisode(false)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
