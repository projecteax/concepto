import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { Show, GlobalAsset, Episode, EpisodeIdea, GeneralIdea, PlotTheme } from '@/types';

export interface DownloadOptions {
  // Show data
  includeShowInfo: boolean;
  includePlotThemes: boolean;
  
  // Assets
  includeAssets: boolean;
  assetCategories: {
    character: boolean;
    location: boolean;
    gadget: boolean;
    texture: boolean;
    background: boolean;
    vehicle: boolean;
  };
  includeAssetImages: boolean;
  includeAssetVideos: boolean;
  includeAssetModels: boolean;
  includeAssetVoiceSamples: boolean;
  
  // Episodes
  includeEpisodes: boolean;
  includeEpisodeScripts: boolean;
  includeAVScripts: boolean;
  includeAVPreviewData: boolean;
  includeScreenplays: boolean;
  includeNarrativeStories: boolean;
  includeEpisodeScenes: boolean;
  includeEpisodeImages: boolean;
  
  // Ideas
  includeEpisodeIdeas: boolean;
  includeGeneralIdeas: boolean;
}

export class ShowDownloadService {
  private zip: JSZip;
  private show: Show;
  private globalAssets: GlobalAsset[];
  private episodes: Episode[];
  private episodeIdeas: EpisodeIdea[];
  private generalIdeas: GeneralIdea[];
  private plotThemes: PlotTheme[];

  constructor(
    show: Show,
    globalAssets: GlobalAsset[],
    episodes: Episode[],
    episodeIdeas: EpisodeIdea[],
    generalIdeas: GeneralIdea[],
    plotThemes: PlotTheme[] = []
  ) {
    this.zip = new JSZip();
    this.show = show;
    this.globalAssets = globalAssets;
    this.episodes = episodes;
    this.episodeIdeas = episodeIdeas;
    this.generalIdeas = generalIdeas;
    this.plotThemes = plotThemes;
  }

  // Helper function to safely convert timestamps to Date objects
  private safeToDate(timestamp: unknown): Date {
    if (!timestamp) return new Date();
    if (timestamp instanceof Date) return timestamp;
    if (timestamp && typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as {toDate: () => Date}).toDate === 'function') {
      return (timestamp as {toDate: () => Date}).toDate();
    }
    if (timestamp && typeof timestamp === 'object' && 'seconds' in timestamp && typeof (timestamp as { seconds: number }).seconds === 'number') {
      return new Date((timestamp as { seconds: number }).seconds * 1000);
    }
    if (typeof timestamp === 'string' || typeof timestamp === 'number') {
      const date = new Date(timestamp);
      return isNaN(date.getTime()) ? new Date() : date;
    }
    return new Date();
  }

  // Helper function to safely format dates
  private formatDate(timestamp: unknown): string {
    const date = this.safeToDate(timestamp);
    return date.toLocaleDateString();
  }

  async downloadShow(options: DownloadOptions): Promise<void> {
    try {
      // Create main show folder
      const showFolder = this.zip.folder(`${this.show.name}_Backup_${new Date().toISOString().split('T')[0]}`);
      
      // Add show info
      if (options.includeShowInfo) {
        await this.addShowInfo(showFolder!);
      }
      
      // Add plot themes
      if (options.includePlotThemes && this.plotThemes.length > 0) {
        await this.addPlotThemes(showFolder!, options);
      }
      
      // Add assets
      if (options.includeAssets) {
        await this.addAssets(showFolder!, options);
      }
      
      // Add episodes
      if (options.includeEpisodes) {
        await this.addEpisodes(showFolder!, options);
      }
      
      // Add ideas
      if (options.includeEpisodeIdeas && this.episodeIdeas.length > 0) {
        await this.addEpisodeIdeas(showFolder!, options);
      }
      
      if (options.includeGeneralIdeas && this.generalIdeas.length > 0) {
        await this.addGeneralIdeas(showFolder!, options);
      }

      // Generate and download ZIP
      const content = await this.zip.generateAsync({ 
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 }
      });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.show.name}_Backup_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error creating download:', error);
      throw error;
    }
  }

  private async addShowInfo(showFolder: JSZip): Promise<void> {
    const infoFolder = showFolder.folder('00_Show_Info');
    
    const showInfo = `# ${this.show.name}

**Description:** ${this.show.description || 'No description available'}

**Seasons:** ${this.show.seasonsCount || 'Not specified'}
**Archived:** ${this.show.archived ? 'Yes' : 'No'}

**Created:** ${this.formatDate(this.show.createdAt)}
**Updated:** ${this.formatDate(this.show.updatedAt)}

## Backup Information
- Backup Date: ${new Date().toLocaleString()}
- Assets: ${this.globalAssets.length} items
- Episodes: ${this.episodes.length} episodes
- Episode Ideas: ${this.episodeIdeas.length} ideas
- General Ideas: ${this.generalIdeas.length} ideas
- Plot Themes: ${this.plotThemes.length} themes
    `;

    infoFolder!.file('Show_Information.txt', showInfo);
    
    // Add show images if available
    if (this.show.coverImageUrl) {
      try {
        const coverBlob = await this.fetchImageAsBlob(this.show.coverImageUrl);
        infoFolder!.file('cover_image.jpg', coverBlob);
      } catch (error) {
        console.warn('Failed to download cover image:', error);
      }
    }
    
    if (this.show.logoUrl) {
      try {
        const logoBlob = await this.fetchImageAsBlob(this.show.logoUrl);
        infoFolder!.file('logo.png', logoBlob);
      } catch (error) {
        console.warn('Failed to download logo:', error);
      }
    }
    
    // Create PDF version
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text(this.show.name, 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Description: ${this.show.description || 'No description available'}`, 20, 40);
    pdf.text(`Created: ${this.formatDate(this.show.createdAt)}`, 20, 50);
    pdf.text(`Updated: ${this.formatDate(this.show.updatedAt)}`, 20, 60);
    
    const pdfBlob = pdf.output('blob');
    infoFolder!.file('Show_Information.pdf', pdfBlob);
  }

  private async addPlotThemes(showFolder: JSZip, options: DownloadOptions): Promise<void> {
    const themesFolder = showFolder.folder('01_Plot_Themes');
    
    for (const theme of this.plotThemes) {
      const themeFile = themesFolder!.file(`${theme.name.replace(/[^a-z0-9]/gi, '_')}.txt`, `
# ${theme.name}

**Description:** ${theme.description}

**Key Elements:**
${theme.keyElements.map(el => `- ${el}`).join('\n')}

**Tags:** ${theme.tags.join(', ')}

**Created:** ${this.formatDate(theme.createdAt)}
**Updated:** ${this.formatDate(theme.updatedAt)}
      `);
    }
    
    // Summary file
    themesFolder!.file('00_Plot_Themes_Summary.txt', `
# Plot Themes Summary

Total Themes: ${this.plotThemes.length}

${this.plotThemes.map(t => `## ${t.name}\n${t.description}\n`).join('\n')}
    `);
  }

  private async addAssets(showFolder: JSZip, options: DownloadOptions): Promise<void> {
    const assetsFolder = showFolder.folder('02_Assets');
    
    // Filter assets by selected categories
    const filteredAssets = this.globalAssets.filter(asset => 
      options.assetCategories[asset.category as keyof typeof options.assetCategories]
    );
    
    if (filteredAssets.length === 0) return;
    
    // Group assets by category
    const assetsByCategory = filteredAssets.reduce((acc, asset) => {
      if (!acc[asset.category]) {
        acc[asset.category] = [];
      }
      acc[asset.category].push(asset);
      return acc;
    }, {} as Record<string, GlobalAsset[]>);

    for (const [category, assets] of Object.entries(assetsByCategory)) {
      const categoryFolder = assetsFolder!.folder(category);
      
      for (const asset of assets) {
        const assetFolder = categoryFolder!.folder(asset.name.replace(/[^a-z0-9]/gi, '_'));
        
        // Add asset metadata
        await this.addAssetDescription(assetFolder!, asset, options);
        
        // Add concept images
        if (options.includeAssetImages && asset.concepts && asset.concepts.length > 0) {
          const conceptsFolder = assetFolder!.folder('concepts');
          for (const concept of asset.concepts) {
            if (concept.imageUrl) {
              try {
                const imageBlob = await this.fetchImageAsBlob(concept.imageUrl);
                const ext = concept.imageUrl.split('.').pop()?.split('?')[0] || 'jpg';
                conceptsFolder!.file(
                  `${concept.name.replace(/[^a-z0-9]/gi, '_')}.${ext}`,
                  imageBlob
                );
              } catch (error) {
                console.warn(`Failed to download concept image: ${concept.imageUrl}`, error);
              }
            }
            
            // Add concept videos
            if (options.includeAssetVideos && concept.videoUrl) {
              try {
                const videoBlob = await this.fetchAsBlob(concept.videoUrl);
                conceptsFolder!.file(
                  `${concept.name.replace(/[^a-z0-9]/gi, '_')}.mp4`,
                  videoBlob
                );
              } catch (error) {
                console.warn(`Failed to download concept video: ${concept.videoUrl}`, error);
              }
            }
            
            // Add concept 3D models
            if (options.includeAssetModels && concept.fbxUrl) {
              try {
                const modelBlob = await this.fetchAsBlob(concept.fbxUrl);
                conceptsFolder!.file(
                  `${concept.name.replace(/[^a-z0-9]/gi, '_')}.fbx`,
                  modelBlob
                );
              } catch (error) {
                console.warn(`Failed to download concept model: ${concept.fbxUrl}`, error);
              }
            }
          }
        }
        
        // Add gallery images
        if (options.includeAssetImages && asset.galleryImages && asset.galleryImages.length > 0) {
          const galleryFolder = assetFolder!.folder('gallery');
          for (let i = 0; i < asset.galleryImages.length; i++) {
            try {
              const imageBlob = await this.fetchImageAsBlob(asset.galleryImages[i]);
              const ext = asset.galleryImages[i].split('.').pop()?.split('?')[0] || 'jpg';
              galleryFolder!.file(`image_${i + 1}.${ext}`, imageBlob);
            } catch (error) {
              console.warn(`Failed to download gallery image: ${asset.galleryImages[i]}`, error);
            }
          }
        }
        
        // Add main render
        if (options.includeAssetImages && asset.mainRender) {
          try {
            const renderBlob = await this.fetchImageAsBlob(asset.mainRender);
            const ext = asset.mainRender.split('.').pop()?.split('?')[0] || 'jpg';
            assetFolder!.file(`main_render.${ext}`, renderBlob);
          } catch (error) {
            console.warn(`Failed to download main render: ${asset.mainRender}`, error);
          }
        }
        
        // Add AI reference images
        if (options.includeAssetImages && asset.aiRefImages) {
          const aiRefFolder = assetFolder!.folder('ai_references');
          const refImages = asset.aiRefImages;
          
          for (const [key, urls] of Object.entries(refImages)) {
            if (Array.isArray(urls) && urls.length > 0) {
              const typeFolder = aiRefFolder!.folder(key);
              for (let i = 0; i < urls.length; i++) {
                try {
                  const imageBlob = await this.fetchImageAsBlob(urls[i]);
                  const ext = urls[i].split('.').pop()?.split('?')[0] || 'jpg';
                  typeFolder!.file(`image_${i + 1}.${ext}`, imageBlob);
                } catch (error) {
                  console.warn(`Failed to download AI ref image: ${urls[i]}`, error);
                }
              }
            }
          }
        }
        
        // Character-specific files
        if (asset.category === 'character') {
          const char = asset as any; // Type assertion for character-specific fields
          
          // Character main image
          if (options.includeAssetImages && char.mainImage) {
            try {
              const mainBlob = await this.fetchImageAsBlob(char.mainImage);
              assetFolder!.file('character_main.jpg', mainBlob);
            } catch (error) {
              console.warn('Failed to download character main image:', error);
            }
          }
          
          // Character gallery
          if (options.includeAssetImages && char.characterGallery && char.characterGallery.length > 0) {
            const charGalleryFolder = assetFolder!.folder('character_gallery');
            for (let i = 0; i < char.characterGallery.length; i++) {
              try {
                const imageBlob = await this.fetchImageAsBlob(char.characterGallery[i]);
                charGalleryFolder!.file(`gallery_${i + 1}.jpg`, imageBlob);
              } catch (error) {
                console.warn(`Failed to download character gallery image: ${char.characterGallery[i]}`, error);
              }
            }
          }
          
          // Character videos
          if (options.includeAssetVideos) {
            const videosFolder = assetFolder!.folder('videos');
            
            if (char.conceptVideos && char.conceptVideos.length > 0) {
              const conceptVideosFolder = videosFolder!.folder('concepts');
              for (let i = 0; i < char.conceptVideos.length; i++) {
                try {
                  const videoBlob = await this.fetchAsBlob(char.conceptVideos[i]);
                  conceptVideosFolder!.file(`concept_${i + 1}.mp4`, videoBlob);
                } catch (error) {
                  console.warn(`Failed to download concept video: ${char.conceptVideos[i]}`, error);
                }
              }
            }
            
            if (char.renderVideos && char.renderVideos.length > 0) {
              const renderVideosFolder = videosFolder!.folder('renders');
              for (let i = 0; i < char.renderVideos.length; i++) {
                try {
                  const videoBlob = await this.fetchAsBlob(char.renderVideos[i]);
                  renderVideosFolder!.file(`render_${i + 1}.mp4`, videoBlob);
                } catch (error) {
                  console.warn(`Failed to download render video: ${char.renderVideos[i]}`, error);
                }
              }
            }
          }
          
          // Voice samples
          if (options.includeAssetVoiceSamples && char.voice && char.voice.samples && char.voice.samples.length > 0) {
            const voiceFolder = assetFolder!.folder('voice_samples');
            for (const sample of char.voice.samples) {
              if (sample.url) {
                try {
                  const audioBlob = await this.fetchAsBlob(sample.url);
                  voiceFolder!.file(
                    `${sample.filename || `sample_${sample.language || 'unknown'}.mp3`}`,
                    audioBlob
                  );
                  // Also save metadata
                  voiceFolder!.file(
                    `${sample.filename || `sample_${sample.language || 'unknown'}`}_info.txt`,
                    `Description: ${sample.description || 'No description'}\nLanguage: ${sample.language || 'Unknown'}`
                  );
                } catch (error) {
                  console.warn(`Failed to download voice sample: ${sample.url}`, error);
                }
              }
            }
          }
          
          // 3D Models
          if (options.includeAssetModels && char.modelFiles) {
            const modelsFolder = assetFolder!.folder('3d_models');
            const modelFiles = char.modelFiles;
            
            // Note: Model file names are stored, but actual files might be in S3
            // We'll create a manifest of available models
            const modelManifest = Object.entries(modelFiles)
              .filter(([_, filename]) => filename)
              .map(([type, filename]) => `${type}: ${filename}`)
              .join('\n');
            
            if (modelManifest) {
              modelsFolder!.file('model_manifest.txt', `
Available 3D Models:
${modelManifest}

Note: Model files may need to be downloaded separately from your storage service.
              `);
            }
            
            // Try to download uploaded models if available
            if (char.uploadedModels && char.uploadedModels.length > 0) {
              for (const model of char.uploadedModels) {
                if (model.url) {
                  try {
                    const modelBlob = await this.fetchAsBlob(model.url);
                    modelsFolder!.file(model.filename || `model_${Date.now()}.fbx`, modelBlob);
                  } catch (error) {
                    console.warn(`Failed to download model: ${model.url}`, error);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private async addEpisodes(showFolder: JSZip, options: DownloadOptions): Promise<void> {
    const episodesFolder = showFolder.folder('03_Episodes');
    
    for (const episode of this.episodes) {
      const episodeFolder = episodesFolder!.folder(
        `Episode_${episode.episodeNumber.toString().padStart(3, '0')}_${episode.title.replace(/[^a-z0-9]/gi, '_')}`
      );
      
      // Episode metadata
      await this.addEpisodeMetadata(episodeFolder!, episode, options);
      
      // Legacy script
      if (options.includeEpisodeScripts && episode.script) {
        episodeFolder!.file('00_Legacy_Script.txt', episode.script);
      }
      
      // AV Script
      if (options.includeAVScripts && episode.avScript) {
        await this.addAVScript(episodeFolder!, episode.avScript, options);
      }
      
      // AV Preview Data
      if (options.includeAVPreviewData && episode.avPreviewData) {
        await this.addAVPreviewData(episodeFolder!, episode.avPreviewData);
      }
      
      // Screenplay Data
      if (options.includeScreenplays && episode.screenplayData) {
        await this.addScreenplayData(episodeFolder!, episode.screenplayData);
      }
      
      // Narrative Stories
      if (options.includeNarrativeStories) {
        await this.addNarrativeStories(episodeFolder!, episode);
      }
      
      // Legacy scenes
      if (options.includeEpisodeScenes && episode.scenes && episode.scenes.length > 0) {
        await this.addEpisodeScenes(episodeFolder!, episode, options);
      }
    }
  }

  private async addEpisodeMetadata(episodeFolder: JSZip, episode: Episode, options: DownloadOptions): Promise<void> {
    const metadata = `# Episode ${episode.episodeNumber}: ${episode.title}

**Description:** ${episode.description || 'No description available'}

**Plot Theme ID:** ${episode.plotThemeId || 'Not assigned'}

**Created:** ${this.formatDate(episode.createdAt)}
**Updated:** ${this.formatDate(episode.updatedAt)}

## Episode Characters
${episode.characters.map(c => `- ${c.characterName} (${c.type})${c.role ? ` - ${c.role}` : ''}`).join('\n') || 'None'}

## Episode Locations
${episode.locations.map(l => `- ${l.locationName}${l.description ? `: ${l.description}` : ''}`).join('\n') || 'None'}

## Available Data
- Legacy Script: ${episode.script ? 'Yes' : 'No'}
- AV Script: ${episode.avScript ? 'Yes' : 'No'}
- AV Preview Data: ${episode.avPreviewData ? 'Yes' : 'No'}
- Screenplay Data: ${episode.screenplayData ? 'Yes (PL & EN)' : 'No'}
- Narrative Stories: ${(episode.narrativeStories && episode.narrativeStories.length > 0) || (episode.narrativeStoriesEN && episode.narrativeStoriesEN.length > 0) ? 'Yes (PL & EN)' : episode.narrativeStory || episode.narrativeStoryEN ? 'Yes (Legacy)' : 'No'}
- Legacy Scenes: ${episode.scenes && episode.scenes.length > 0 ? `Yes (${episode.scenes.length} scenes)` : 'No'}
    `;
    
    episodeFolder.file('00_Episode_Metadata.txt', metadata);
  }

  private async addAVScript(episodeFolder: JSZip, avScript: any, options: DownloadOptions): Promise<void> {
    const avScriptFolder = episodeFolder.folder('01_AV_Script');
    
    // Main AV Script info
    avScriptFolder!.file('AV_Script_Info.txt', `
# AV Script: ${avScript.title}

**Version:** ${avScript.version}
**Total Runtime:** ${avScript.totalRuntime}s (${this.formatDuration(avScript.totalRuntime)})
**Total Words:** ${avScript.totalWords}

**Created:** ${this.formatDate(avScript.createdAt)}
**Updated:** ${this.formatDate(avScript.updatedAt)}

**Segments:** ${avScript.segments?.length || 0}
    `);
    
    // Add segments
    if (avScript.segments && avScript.segments.length > 0) {
      const segmentsFolder = avScriptFolder!.folder('segments');
      
      for (const segment of avScript.segments) {
        const segmentFolder = segmentsFolder!.folder(`Segment_${segment.segmentNumber.toString().padStart(3, '0')}_${segment.title.replace(/[^a-z0-9]/gi, '_')}`);
        
        segmentFolder!.file('Segment_Info.txt', `
# Segment ${segment.segmentNumber}: ${segment.title}

**Scene Setting:** ${segment.sceneSetting || 'Not specified'}
**Location:** ${segment.locationName || segment.locationId || 'Not specified'}
**Action Description:** ${segment.actionDescription || 'None'}

**Total Runtime:** ${segment.totalRuntime}s
**Total Words:** ${segment.totalWords}

**Shots:** ${segment.shots?.length || 0}

**Created:** ${this.formatDate(segment.createdAt)}
**Updated:** ${this.formatDate(segment.updatedAt)}
        `);
        
        // Add shots
        if (segment.shots && segment.shots.length > 0) {
          const shotsFolder = segmentFolder!.folder('shots');
          
          for (const shot of segment.shots) {
            const shotInfo = `
# Shot ${shot.shotNumber}: ${shot.visual || 'Untitled'}

**Take:** ${shot.take || 'Not specified'}
**Visual Description:** ${shot.visual || 'Not specified'}
**Audio Description:** ${shot.audio || 'Not specified'}
**Duration:** ${shot.duration || 0}s
**Word Count:** ${shot.wordCount || 0}
**Runtime:** ${shot.runtime || 0}s
**Video Offset:** ${shot.videoOffset || 0}s

**Main Image:** ${shot.imageUrl || 'Not available'}
**Main Video:** ${shot.videoUrl || 'Not available'}

**Audio Files:**
${shot.audioFiles?.map((af: any) => `- ${af.voiceName || 'audio_file'}: ${af.audioUrl || 'No URL'}`).join('\n') || 'None'}
            `;
            
            shotsFolder!.file(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Info.txt`, shotInfo);
            
            // Download main image and video if available
            if (options.includeEpisodeImages && shot.imageUrl) {
              try {
                const imageBlob = await this.fetchImageAsBlob(shot.imageUrl);
                shotsFolder!.file(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Main_Image.jpg`, imageBlob);
              } catch (error) {
                console.warn(`Failed to download shot main image: ${shot.imageUrl}`, error);
              }
            }
            
            if (options.includeAssetVideos && shot.videoUrl) {
              try {
                const videoBlob = await this.fetchAsBlob(shot.videoUrl);
                shotsFolder!.file(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Main_Video.mp4`, videoBlob);
              } catch (error) {
                console.warn(`Failed to download shot main video: ${shot.videoUrl}`, error);
              }
            }
            
            // Download audio files if available
            if (options.includeAssetVoiceSamples && shot.audioFiles && shot.audioFiles.length > 0) {
              const audioFolder = shotsFolder!.folder(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Audio`);
              for (const audioFile of shot.audioFiles) {
                if (audioFile.audioUrl) {
                  try {
                    const audioBlob = await this.fetchAsBlob(audioFile.audioUrl);
                    audioFolder!.file(
                      `${audioFile.voiceName || 'audio'}_${audioFile.id || Date.now()}.mp3`,
                      audioBlob
                    );
                  } catch (error) {
                    console.warn(`Failed to download audio file: ${audioFile.audioUrl}`, error);
                  }
                }
              }
            }
            
            // Download image generation thread data if available
            if (options.includeEpisodeImages && shot.imageGenerationThread) {
              const imageGenFolder = shotsFolder!.folder(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Image_Generation`);
              
              // Save thread as JSON
              imageGenFolder!.file('Image_Generation_Thread.json', JSON.stringify(shot.imageGenerationThread, null, 2));
              
              // Download generated images
              if (shot.imageGenerationThread.generatedImages && shot.imageGenerationThread.generatedImages.length > 0) {
                const generatedImagesFolder = imageGenFolder!.folder('generated_images');
                for (const genImage of shot.imageGenerationThread.generatedImages) {
                  if (genImage.imageUrl) {
                    try {
                      const imageBlob = await this.fetchImageAsBlob(genImage.imageUrl);
                      generatedImagesFolder!.file(`${genImage.id}_${genImage.style}.jpg`, imageBlob);
                    } catch (error) {
                      console.warn(`Failed to download generated image: ${genImage.imageUrl}`, error);
                    }
                  }
                }
              }
              
              // Download generated videos
              if (options.includeAssetVideos && shot.imageGenerationThread.generatedVideos && shot.imageGenerationThread.generatedVideos.length > 0) {
                const generatedVideosFolder = imageGenFolder!.folder('generated_videos');
                for (const genVideo of shot.imageGenerationThread.generatedVideos) {
                  if (genVideo.videoUrl) {
                    try {
                      const videoBlob = await this.fetchAsBlob(genVideo.videoUrl);
                      generatedVideosFolder!.file(`${genVideo.id}_video.mp4`, videoBlob);
                    } catch (error) {
                      console.warn(`Failed to download generated video: ${genVideo.videoUrl}`, error);
                    }
                  }
                }
              }
              
              // Download reference images/videos
              if (shot.imageGenerationThread.referenceImage) {
                try {
                  const refImageBlob = await this.fetchImageAsBlob(shot.imageGenerationThread.referenceImage);
                  imageGenFolder!.file('reference_image.jpg', refImageBlob);
                } catch (error) {
                  console.warn(`Failed to download reference image: ${shot.imageGenerationThread.referenceImage}`, error);
                }
              }
              
              if (options.includeAssetVideos && shot.imageGenerationThread.referenceVideo) {
                try {
                  const refVideoBlob = await this.fetchAsBlob(shot.imageGenerationThread.referenceVideo);
                  imageGenFolder!.file('reference_video.mp4', refVideoBlob);
                } catch (error) {
                  console.warn(`Failed to download reference video: ${shot.imageGenerationThread.referenceVideo}`, error);
                }
              }
              
              if (shot.imageGenerationThread.startFrame) {
                try {
                  const startFrameBlob = await this.fetchImageAsBlob(shot.imageGenerationThread.startFrame);
                  imageGenFolder!.file('start_frame.jpg', startFrameBlob);
                } catch (error) {
                  console.warn(`Failed to download start frame: ${shot.imageGenerationThread.startFrame}`, error);
                }
              }
              
              if (shot.imageGenerationThread.endFrame) {
                try {
                  const endFrameBlob = await this.fetchImageAsBlob(shot.imageGenerationThread.endFrame);
                  imageGenFolder!.file('end_frame.jpg', endFrameBlob);
                } catch (error) {
                  console.warn(`Failed to download end frame: ${shot.imageGenerationThread.endFrame}`, error);
                }
              }
              
              if (shot.imageGenerationThread.sketchImage) {
                try {
                  const sketchBlob = await this.fetchImageAsBlob(shot.imageGenerationThread.sketchImage);
                  imageGenFolder!.file('sketch_image.jpg', sketchBlob);
                } catch (error) {
                  console.warn(`Failed to download sketch image: ${shot.imageGenerationThread.sketchImage}`, error);
                }
              }
            }
          }
        }
      }
    }
  }

  private async addAVPreviewData(episodeFolder: JSZip, avPreviewData: any): Promise<void> {
    const previewFolder = episodeFolder.folder('02_AV_Preview_Data');
    
    const tracksInfo = `
# AV Preview Data

**Audio Tracks:** ${avPreviewData.audioTracks?.length || 0}

${avPreviewData.audioTracks?.map((track: any, idx: number) => `
## Track ${idx + 1}: ${track.name}

**Type:** ${track.type}
**Muted:** ${track.isMuted ? 'Yes' : 'No'}
**Volume:** ${track.volume || 100}%
**Clips:** ${track.clips?.length || 0}

${track.clips?.map((clip: any, clipIdx: number) => `
### Clip ${clipIdx + 1}
- Name: ${clip.name}
- URL: ${clip.url}
- Start Time: ${clip.startTime}s
- Duration: ${clip.duration}s
- Offset: ${clip.offset}s
- Volume: ${clip.volume || 1}
`).join('\n') || 'No clips'}
`).join('\n') || 'No tracks'}
    `;
    
    previewFolder!.file('AV_Preview_Data.txt', tracksInfo);
    
    // Export as JSON for potential re-import
    previewFolder!.file('AV_Preview_Data.json', JSON.stringify(avPreviewData, null, 2));
  }

  private async addScreenplayData(episodeFolder: JSZip, screenplayData: any): Promise<void> {
    const screenplayFolder = episodeFolder.folder('03_Screenplay');
    
    // Polish screenplay
    if (screenplayData.elements && screenplayData.elements.length > 0) {
      const plFolder = screenplayFolder!.folder('Polish_PL');
      plFolder!.file('Screenplay_PL.txt', this.formatScreenplay(screenplayData.elements, screenplayData.title));
      plFolder!.file('Screenplay_PL.json', JSON.stringify(screenplayData.elements, null, 2));
    }
    
    // English screenplay
    if (screenplayData.elementsEN && screenplayData.elementsEN.length > 0) {
      const enFolder = screenplayFolder!.folder('English_EN');
      enFolder!.file('Screenplay_EN.txt', this.formatScreenplay(screenplayData.elementsEN, screenplayData.titleEN || screenplayData.title));
      enFolder!.file('Screenplay_EN.json', JSON.stringify(screenplayData.elementsEN, null, 2));
    }
    
    // Screenplay metadata
    screenplayFolder!.file('Screenplay_Info.txt', `
# Screenplay Data

**Title (PL):** ${screenplayData.title}
**Title (EN):** ${screenplayData.titleEN || 'Not available'}

**Elements (PL):** ${screenplayData.elements?.length || 0}
**Elements (EN):** ${screenplayData.elementsEN?.length || 0}
    `);
  }

  private formatScreenplay(elements: any[], title: string): string {
    let screenplay = `TITLE: ${title}\n\n`;
    
    for (const element of elements.sort((a, b) => a.position - b.position)) {
      switch (element.type) {
        case 'scene-setting':
          screenplay += `\n[${element.content}]\n\n`;
          break;
        case 'character':
          screenplay += `\n${element.content.toUpperCase()}\n`;
          break;
        case 'dialogue':
          screenplay += `${element.content}\n\n`;
          break;
        case 'action':
          screenplay += `${element.content}\n\n`;
          break;
        case 'parenthetical':
          screenplay += `(${element.content})\n`;
          break;
        default:
          screenplay += `${element.content}\n\n`;
      }
    }
    
    return screenplay;
  }

  private async addNarrativeStories(episodeFolder: JSZip, episode: Episode): Promise<void> {
    const narrativesFolder = episodeFolder.folder('04_Narrative_Stories');
    
    // Polish narratives
    if (episode.narrativeStories && episode.narrativeStories.length > 0) {
      const plFolder = narrativesFolder!.folder('Polish_PL');
      for (const story of episode.narrativeStories) {
        plFolder!.file(
          `${story.id}_Narrative_PL.txt`,
          `# ${story.title || 'Narrative Story'}\n\n${story.text || ''}`
        );
      }
    } else if (episode.narrativeStory) {
      const plFolder = narrativesFolder!.folder('Polish_PL');
      plFolder!.file('Legacy_Narrative_PL.txt', episode.narrativeStory);
    }
    
    // English narratives
    if (episode.narrativeStoriesEN && episode.narrativeStoriesEN.length > 0) {
      const enFolder = narrativesFolder!.folder('English_EN');
      for (const story of episode.narrativeStoriesEN) {
        enFolder!.file(
          `${story.id}_Narrative_EN.txt`,
          `# ${story.title || 'Narrative Story'}\n\n${story.text || ''}`
        );
      }
    } else if (episode.narrativeStoryEN) {
      const enFolder = narrativesFolder!.folder('English_EN');
      enFolder!.file('Legacy_Narrative_EN.txt', episode.narrativeStoryEN);
    }
  }

  private async addEpisodeScenes(episodeFolder: JSZip, episode: Episode, options: DownloadOptions): Promise<void> {
    const scenesFolder = episodeFolder.folder('05_Legacy_Scenes');
    
    for (const scene of episode.scenes!) {
      const sceneFolder = scenesFolder!.folder(`Scene_${scene.sceneNumber.toString().padStart(3, '0')}_${scene.title.replace(/[^a-z0-9]/gi, '_')}`);
      
      const sceneInfo = `
# Scene ${scene.sceneNumber}: ${scene.title}

**Description:** ${scene.description || 'No description available'}
**Action Description:** ${scene.actionDescription || 'None'}
**Location:** ${scene.locationName || scene.locationId || 'Not specified'}

**Script:**
${scene.script || 'No script available'}

**Characters:** ${scene.characters?.map(c => c.characterName).join(', ') || 'None'}
**Gadgets:** ${scene.gadgets?.map(g => g.gadgetName).join(', ') || 'None'}
**Shots:** ${scene.shots?.length || 0}

**Created:** ${this.formatDate(scene.createdAt)}
**Updated:** ${this.formatDate(scene.updatedAt)}
      `;
      
      sceneFolder!.file('Scene_Info.txt', sceneInfo);
      
      // Add shots
      if (scene.shots && scene.shots.length > 0) {
        const shotsFolder = sceneFolder!.folder('shots');
        for (const shot of scene.shots) {
          const shotInfo = `
# Shot ${shot.shotNumber}: ${shot.title}

**Description:** ${shot.description || 'No description available'}

**Camera Shot:** ${shot.cameraShot.shotType}${shot.cameraShot.customShotType ? ` (${shot.cameraShot.customShotType})` : ''}
**Duration:** ${shot.cameraShot.duration || 0}s
**Camera Movement:** ${shot.cameraShot.cameraMovement || 'STATIC'}${shot.cameraShot.customMovement ? ` (${shot.cameraShot.customMovement})` : ''}

**Storyboards:** ${shot.storyboards?.length || 0}
**Inspiration Images:** ${shot.inspirationImages?.length || 0}
          `;
          
          shotsFolder!.file(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Info.txt`, shotInfo);
          
          // Download images if requested
          if (options.includeEpisodeImages) {
            // Inspiration images
            if (shot.inspirationImages && shot.inspirationImages.length > 0) {
              const imagesFolder = shotsFolder!.folder(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Images`);
              for (let i = 0; i < shot.inspirationImages.length; i++) {
                try {
                  const imageBlob = await this.fetchImageAsBlob(shot.inspirationImages[i]);
                  imagesFolder!.file(`inspiration_${i + 1}.jpg`, imageBlob);
                } catch (error) {
                  console.warn(`Failed to download inspiration image: ${shot.inspirationImages[i]}`, error);
                }
              }
            }
            
            // Storyboards
            if (shot.storyboards && shot.storyboards.length > 0) {
              const storyboardsFolder = shotsFolder!.folder(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Storyboards`);
              for (let i = 0; i < shot.storyboards.length; i++) {
                if (shot.storyboards[i].imageUrl) {
                  try {
                    const imageBlob = await this.fetchImageAsBlob(shot.storyboards[i].imageUrl);
                    storyboardsFolder!.file(`storyboard_${i + 1}.jpg`, imageBlob);
                    if (shot.storyboards[i].description) {
                      storyboardsFolder!.file(`storyboard_${i + 1}_description.txt`, shot.storyboards[i].description || '');
                    }
                  } catch (error) {
                    console.warn(`Failed to download storyboard: ${shot.storyboards[i].imageUrl}`, error);
                  }
                }
              }
            }
            
            // Featured image
            if (shot.featuredImage) {
              try {
                const imageBlob = await this.fetchImageAsBlob(shot.featuredImage);
                shotsFolder!.file(`Shot_${shot.shotNumber.toString().padStart(3, '0')}_Featured.jpg`, imageBlob);
              } catch (error) {
                console.warn(`Failed to download featured image: ${shot.featuredImage}`, error);
              }
            }
          }
        }
      }
    }
  }

  private async addEpisodeIdeas(showFolder: JSZip, options: DownloadOptions): Promise<void> {
    const ideasFolder = showFolder.folder('04_Episode_Ideas');
    
    for (const idea of this.episodeIdeas) {
      const ideaFile = ideasFolder!.file(`${idea.title.replace(/[^a-z0-9]/gi, '_')}.txt`, `
# ${idea.title}

**Description:** ${idea.description || 'No description available'}

**Status:** ${idea.status}
**Tags:** ${idea.tags.join(', ')}

**Created:** ${this.formatDate(idea.createdAt)}
**Updated:** ${this.formatDate(idea.updatedAt)}
      `);
    }
  }

  private async addGeneralIdeas(showFolder: JSZip, options: DownloadOptions): Promise<void> {
    const ideasFolder = showFolder.folder('05_General_Ideas');
    
    for (const idea of this.generalIdeas) {
      const ideaFolder = ideasFolder!.folder(idea.name.replace(/[^a-z0-9]/gi, '_'));
      
      ideaFolder!.file('Idea_Info.txt', `
# ${idea.name}

**Description:** ${idea.description || 'No description available'}

**Tags:** ${idea.tags.join(', ')}

**Created:** ${this.formatDate(idea.createdAt)}
**Updated:** ${this.formatDate(idea.updatedAt)}
      `);
      
      // Add images if available
      if (options.includeEpisodeImages && idea.images && idea.images.length > 0) {
        const imagesFolder = ideaFolder!.folder('images');
        for (let i = 0; i < idea.images.length; i++) {
          try {
            const imageBlob = await this.fetchImageAsBlob(idea.images[i]);
            imagesFolder!.file(`image_${i + 1}.jpg`, imageBlob);
          } catch (error) {
            console.warn(`Failed to download idea image: ${idea.images[i]}`, error);
          }
        }
      }
    }
  }

  private async addAssetDescription(assetFolder: JSZip, asset: GlobalAsset, options: DownloadOptions): Promise<void> {
    const description = `
# ${asset.name}

**Category:** ${asset.category}
**Description:** ${asset.description || 'No description available'}

${asset.category === 'character' && (asset as any).isMainCharacter ? '**Main Character:** Yes\n' : ''}

**Created:** ${this.formatDate(asset.createdAt)}
**Updated:** ${this.formatDate(asset.updatedAt)}

## Asset Concepts
${asset.concepts?.map(concept => `
### ${concept.name}
**Type:** ${concept.conceptType || 'general'}
**Description:** ${concept.description || 'No description available'}
**Tags:** ${concept.tags.join(', ')}
**Relevance:** ${concept.relevanceScale || 'Not rated'}/5
**Created:** ${this.formatDate(concept.createdAt)}
`).join('\n') || 'No concepts available'}
    `;
    
    assetFolder.file('asset_description.txt', description);
    
    // Create JSON export for potential re-import
    const assetExport = {
      ...asset,
      // Remove URLs that point to cloud storage (they won't work in backup)
      concepts: asset.concepts?.map(c => ({
        ...c,
        imageUrl: c.imageUrl ? '[DOWNLOADED IN CONCEPTS FOLDER]' : undefined,
        videoUrl: c.videoUrl ? '[DOWNLOADED IN CONCEPTS FOLDER]' : undefined,
        fbxUrl: c.fbxUrl ? '[DOWNLOADED IN CONCEPTS FOLDER]' : undefined,
      })),
    };
    assetFolder.file('asset_data.json', JSON.stringify(assetExport, null, 2));
  }

  private formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  private async fetchImageAsBlob(imageUrl: string): Promise<Blob> {
    return this.fetchAsBlob(imageUrl);
  }

  private async fetchAsBlob(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.statusText}`);
    }
    return response.blob();
  }
}