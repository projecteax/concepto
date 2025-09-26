import JSZip from 'jszip';
import jsPDF from 'jspdf';
import { Show, GlobalAsset, Episode, EpisodeIdea, GeneralIdea } from '@/types';

export interface DownloadOptions {
  includeAssets: boolean;
  includeEpisodes: boolean;
  includeIdeas: boolean;
  includeGeneralIdeas: boolean;
}

export class ShowDownloadService {
  private zip: JSZip;
  private show: Show;
  private globalAssets: GlobalAsset[];
  private episodes: Episode[];
  private episodeIdeas: EpisodeIdea[];
  private generalIdeas: GeneralIdea[];

  constructor(
    show: Show,
    globalAssets: GlobalAsset[],
    episodes: Episode[],
    episodeIdeas: EpisodeIdea[],
    generalIdeas: GeneralIdea[]
  ) {
    this.zip = new JSZip();
    this.show = show;
    this.globalAssets = globalAssets;
    this.episodes = episodes;
    this.episodeIdeas = episodeIdeas;
    this.generalIdeas = generalIdeas;
  }

  async downloadShow(options: DownloadOptions = {
    includeAssets: true,
    includeEpisodes: true,
    includeIdeas: true,
    includeGeneralIdeas: true
  }): Promise<void> {
    try {
      // Create main show folder
      const showFolder = this.zip.folder(`${this.show.name}_Export`);
      
      // Add show info
      await this.addShowInfo(showFolder!);
      
      if (options.includeAssets) {
        await this.addAssets(showFolder!);
      }
      
      if (options.includeEpisodes) {
        await this.addEpisodes(showFolder!);
      }
      
      if (options.includeIdeas) {
        await this.addEpisodeIdeas(showFolder!);
      }
      
      if (options.includeGeneralIdeas) {
        await this.addGeneralIdeas(showFolder!);
      }

      // Generate and download ZIP
      const content = await this.zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.show.name}_Export.zip`;
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
    // Add show description as PDF
    const showInfo = `
# ${this.show.name}

**Description:** ${this.show.description || 'No description available'}

**Created:** ${this.show.createdAt.toLocaleDateString()}
**Updated:** ${this.show.updatedAt.toLocaleDateString()}

## Show Overview
This export contains all assets, episodes, and ideas for "${this.show.name}".

## Contents
- Assets: ${this.globalAssets.length} items
- Episodes: ${this.episodes.length} episodes
- Episode Ideas: ${this.episodeIdeas.length} ideas
- General Ideas: ${this.generalIdeas.length} ideas
    `;

    showFolder.file('Show_Info.txt', showInfo);
    
    // Create PDF version
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text(this.show.name, 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Description: ${this.show.description || 'No description available'}`, 20, 40);
    pdf.text(`Created: ${this.show.createdAt.toLocaleDateString()}`, 20, 50);
    pdf.text(`Updated: ${this.show.updatedAt.toLocaleDateString()}`, 20, 60);
    
    const pdfBlob = pdf.output('blob');
    showFolder.file('Show_Info.pdf', pdfBlob);
  }

  private async addAssets(showFolder: JSZip): Promise<void> {
    const assetsFolder = showFolder.folder('Assets');
    
    // Group assets by category
    const assetsByCategory = this.globalAssets.reduce((acc, asset) => {
      if (!acc[asset.category]) {
        acc[asset.category] = [];
      }
      acc[asset.category].push(asset);
      return acc;
    }, {} as Record<string, GlobalAsset[]>);

    for (const [category, assets] of Object.entries(assetsByCategory)) {
      const categoryFolder = assetsFolder!.folder(category);
      
      for (const asset of assets) {
        const assetFolder = categoryFolder!.folder(asset.name);
        
        // Add asset description as PDF
        await this.addAssetDescription(assetFolder!, asset);
        
        // Add concept images
        if (asset.concepts && asset.concepts.length > 0) {
          const conceptsFolder = assetFolder!.folder('concept_images');
          for (const concept of asset.concepts) {
            if (concept.imageUrl) {
              try {
                const imageBlob = await this.fetchImageAsBlob(concept.imageUrl);
                conceptsFolder!.file(
                  `${concept.name || 'concept'}_${Date.now()}.jpg`,
                  imageBlob
                );
              } catch (error) {
                console.warn(`Failed to download image: ${concept.imageUrl}`, error);
              }
            }
          }
        }
      }
    }
  }

  private async addEpisodes(showFolder: JSZip): Promise<void> {
    const episodesFolder = showFolder.folder('Episodes');
    
    for (const episode of this.episodes) {
      const episodeFolder = episodesFolder!.folder(`Episode_${episode.episodeNumber}_${episode.title}`);
      
      // Add episode description as PDF
      await this.addEpisodeDescription(episodeFolder!, episode);
      
      // Add scenes if available
      if (episode.scenes && episode.scenes.length > 0) {
        const scenesFolder = episodeFolder!.folder('Scenes');
        for (const scene of episode.scenes) {
          const sceneFolder = scenesFolder!.folder(`Scene_${scene.sceneNumber}_${scene.title}`);
          
          // Add scene description
          const sceneInfo = `
# Scene ${scene.sceneNumber}: ${scene.title}

**Description:** ${scene.description || 'No description available'}

**Script:** ${scene.script || 'No script available'}

**Characters:** ${scene.characters?.map(c => c.characterName).join(', ') || 'None'}

**Shots:** ${scene.shots?.length || 0} shots
          `;
          
          sceneFolder!.file('Scene_Info.txt', sceneInfo);
          
          // Add shots if available
          if (scene.shots && scene.shots.length > 0) {
            const shotsFolder = sceneFolder!.folder('Shots');
            for (const shot of scene.shots) {
              const shotInfo = `
# Shot ${shot.shotNumber}: ${shot.title}

**Description:** ${shot.description || 'No description available'}

**Camera Shot:** ${shot.cameraShot.shotType}
**Duration:** ${shot.cameraShot.duration}s
              `;
              
              shotsFolder!.file(`Shot_${shot.shotNumber}_Info.txt`, shotInfo);
              
              // Add shot images
              if (shot.inspirationImages && shot.inspirationImages.length > 0) {
                const shotImagesFolder = shotsFolder!.folder(`Shot_${shot.shotNumber}_Images`);
                for (let i = 0; i < shot.inspirationImages.length; i++) {
                  try {
                    const imageBlob = await this.fetchImageAsBlob(shot.inspirationImages[i]);
                    shotImagesFolder!.file(`image_${i + 1}.jpg`, imageBlob);
                  } catch (error) {
                    console.warn(`Failed to download shot image: ${shot.inspirationImages[i]}`, error);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  private async addEpisodeIdeas(showFolder: JSZip): Promise<void> {
    if (this.episodeIdeas.length === 0) return;
    
    const ideasFolder = showFolder.folder('Episode_Ideas');
    
    for (const idea of this.episodeIdeas) {
      const ideaFolder = ideasFolder!.folder(`Idea_${idea.title}`);
      
      const ideaInfo = `
# ${idea.title}

**Description:** ${idea.description || 'No description available'}

**Status:** ${idea.status}
**Tags:** ${idea.tags.join(', ')}

**Created:** ${idea.createdAt.toLocaleDateString()}
**Updated:** ${idea.updatedAt.toLocaleDateString()}
      `;
      
      ideaFolder!.file('Idea_Info.txt', ideaInfo);
    }
  }

  private async addGeneralIdeas(showFolder: JSZip): Promise<void> {
    if (this.generalIdeas.length === 0) return;
    
    const ideasFolder = showFolder.folder('General_Ideas');
    
    for (const idea of this.generalIdeas) {
      const ideaFolder = ideasFolder!.folder(`Idea_${idea.name}`);
      
      const ideaInfo = `
# ${idea.name}

**Description:** ${idea.description || 'No description available'}

**Tags:** ${idea.tags.join(', ')}

**Created:** ${idea.createdAt.toLocaleDateString()}
**Updated:** ${idea.updatedAt.toLocaleDateString()}
      `;
      
      ideaFolder!.file('Idea_Info.txt', ideaInfo);
      
      // Add images if available
      if (idea.images && idea.images.length > 0) {
        const imagesFolder = ideaFolder!.folder('Images');
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

  private async addAssetDescription(assetFolder: JSZip, asset: GlobalAsset): Promise<void> {
    const description = `
# ${asset.name}

**Category:** ${asset.category}
**Description:** ${asset.description || 'No description available'}

**Created:** ${asset.createdAt.toLocaleDateString()}
**Updated:** ${asset.updatedAt.toLocaleDateString()}

## Concepts
${asset.concepts?.map(concept => `
### ${concept.name}
**Description:** ${concept.description || 'No description available'}
**Created:** ${concept.createdAt.toLocaleDateString()}
`).join('\n') || 'No concepts available'}
    `;
    
    assetFolder.file('description.txt', description);
    
    // Create PDF version
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text(asset.name, 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Category: ${asset.category}`, 20, 40);
    pdf.text(`Description: ${asset.description || 'No description available'}`, 20, 50);
    
    if (asset.concepts && asset.concepts.length > 0) {
      pdf.text('Concepts:', 20, 70);
      let y = 80;
      for (const concept of asset.concepts) {
        pdf.text(`• ${concept.name}: ${concept.description || 'No description'}`, 20, y);
        y += 10;
        if (y > 280) {
          pdf.addPage();
          y = 20;
        }
      }
    }
    
    const pdfBlob = pdf.output('blob');
    assetFolder.file('description.pdf', pdfBlob);
  }

  private async addEpisodeDescription(episodeFolder: JSZip, episode: Episode): Promise<void> {
    const description = `
# Episode ${episode.episodeNumber}: ${episode.title}

**Description:** ${episode.description || 'No description available'}

**Created:** ${episode.createdAt.toLocaleDateString()}
**Updated:** ${episode.updatedAt.toLocaleDateString()}

## Scenes
${episode.scenes?.map(scene => `
### Scene ${scene.sceneNumber}: ${scene.title}
**Description:** ${scene.description || 'No description available'}
**Script:** ${scene.script || 'No script available'}
**Characters:** ${scene.characters?.map(c => c.characterName).join(', ') || 'None'}
**Shots:** ${scene.shots?.length || 0} shots
`).join('\n') || 'No scenes available'}
    `;
    
    episodeFolder.file('episode_description.txt', description);
    
    // Create PDF version
    const pdf = new jsPDF();
    pdf.setFontSize(16);
    pdf.text(`Episode ${episode.episodeNumber}: ${episode.title}`, 20, 20);
    pdf.setFontSize(12);
    pdf.text(`Description: ${episode.description || 'No description available'}`, 20, 40);
    
    if (episode.scenes && episode.scenes.length > 0) {
      pdf.text('Scenes:', 20, 60);
      let y = 70;
      for (const scene of episode.scenes) {
        pdf.text(`Scene ${scene.sceneNumber}: ${scene.title}`, 20, y);
        y += 10;
        pdf.text(`Description: ${scene.description || 'No description'}`, 20, y);
        y += 10;
        if (y > 280) {
          pdf.addPage();
          y = 20;
        }
      }
    }
    
    const pdfBlob = pdf.output('blob');
    episodeFolder.file('episode_description.pdf', pdfBlob);
  }

  private async fetchImageAsBlob(imageUrl: string): Promise<Blob> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }
    return response.blob();
  }
}
