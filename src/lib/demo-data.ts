import { AssetConcept, Tag } from '@/types';

export const demoAssetConcepts: AssetConcept[] = [
  {
    id: '1',
    assetId: 'demo-asset-1',
    name: 'Happy Robot Character',
    description: 'A friendly robot character with big eyes and a cheerful smile, perfect for a kids show about technology and friendship.',
    category: 'character',
    tags: ['Happy', 'Robot', 'Friendly'],
    imageUrl: 'https://via.placeholder.com/512x512/3b82f6/ffffff?text=Happy+Robot',
    createdAt: new Date('2024-01-15T10:30:00'),
    updatedAt: new Date('2024-01-15T10:30:00'),
    isGenerated: true,
    prompt: 'A friendly robot character with big eyes and a cheerful smile'
  },
  {
    id: '2',
    assetId: 'demo-asset-2',
    name: 'Magical Forest Background',
    description: 'A whimsical forest setting with glowing mushrooms and floating sparkles, creating an enchanting atmosphere.',
    category: 'background',
    tags: ['Magical', 'Forest', 'Glowing'],
    imageUrl: 'https://via.placeholder.com/512x512/10b981/ffffff?text=Magical+Forest',
    createdAt: new Date('2024-01-14T14:20:00'),
    updatedAt: new Date('2024-01-14T14:20:00'),
    isGenerated: true,
    prompt: 'A whimsical forest setting with glowing mushrooms and floating sparkles'
  },
  {
    id: '3',
    assetId: 'demo-asset-3',
    name: 'Space Explorer Gadget',
    description: 'A futuristic wrist device that helps characters navigate through space and communicate with alien friends.',
    category: 'gadget',
    tags: ['Space', 'Technology', 'Communication'],
    imageUrl: 'https://via.placeholder.com/512x512/8b5cf6/ffffff?text=Space+Gadget',
    fbxUrl: '/models/space-gadget.fbx',
    createdAt: new Date('2024-01-13T09:15:00'),
    updatedAt: new Date('2024-01-13T09:15:00'),
    isGenerated: true,
    prompt: 'A futuristic wrist device for space exploration'
  },
  {
    id: '4',
    assetId: 'demo-asset-4',
    name: 'Underwater City Localization',
    description: 'A vibrant underwater city with coral buildings and schools of colorful fish swimming through the streets.',
    category: 'location',
    tags: ['Underwater', 'City', 'Colorful'],
    imageUrl: 'https://via.placeholder.com/512x512/06b6d4/ffffff?text=Underwater+City',
    createdAt: new Date('2024-01-12T16:45:00'),
    updatedAt: new Date('2024-01-12T16:45:00'),
    isGenerated: true,
    prompt: 'A vibrant underwater city with coral buildings'
  },
  {
    id: '5',
    assetId: 'demo-asset-5',
    name: 'Cloud Texture',
    description: 'Soft, fluffy cloud texture perfect for sky backgrounds and dreamy scenes.',
    category: 'texture',
    tags: ['Soft', 'Fluffy', 'Sky'],
    imageUrl: 'https://via.placeholder.com/512x512/f3f4f6/6b7280?text=Cloud+Texture',
    createdAt: new Date('2024-01-11T11:30:00'),
    updatedAt: new Date('2024-01-11T11:30:00'),
    isGenerated: true,
    prompt: 'Soft, fluffy cloud texture for sky backgrounds'
  },
  {
    id: '6',
    assetId: 'demo-asset-6',
    name: 'Sad Dragon Character',
    description: 'A gentle dragon character with droopy wings and teary eyes, showing emotions that kids can relate to.',
    category: 'character',
    tags: ['Sad', 'Dragon', 'Gentle'],
    imageUrl: 'https://via.placeholder.com/512x512/3b82f6/ffffff?text=Sad+Dragon',
    createdAt: new Date('2024-01-10T13:20:00'),
    updatedAt: new Date('2024-01-10T13:20:00'),
    isGenerated: true,
    prompt: 'A gentle dragon character with droopy wings and teary eyes'
  }
];

export const demoTags: Tag[] = [
  { id: '1',
    name: 'Happy', category: 'facial_expression', color: '#10b981' },
  { id: '2',
    name: 'Sad', category: 'facial_expression', color: '#3b82f6' },
  { id: '3',
    name: 'Angry', category: 'facial_expression', color: '#ef4444' },
  { id: '4',
    name: 'Surprised', category: 'facial_expression', color: '#f59e0b' },
  { id: '5',
    name: 'Excited', category: 'facial_expression', color: '#8b5cf6' },
  { id: '6',
    name: 'Robot', category: 'custom', color: '#6b7280' },
  { id: '7', name: 'Dragon', category: 'custom', color: '#dc2626' },
  { id: '8', name: 'Magical', category: 'custom', color: '#7c3aed' },
  { id: '9', name: 'Space', category: 'custom', color: '#1e40af' },
  { id: '10', name: 'Underwater', category: 'custom', color: '#0891b2' }
];
