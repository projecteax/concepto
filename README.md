# Concepto - Kids TV Show Concept Art Manager

A comprehensive project management tool for organizing and generating concept art for kids' TV shows. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **AI-Powered Image Generation**: Generate concept art using AI with customizable prompts
- **Category Organization**: Organize concepts by Characters, Localizations, Gadgets, Textures, and Backgrounds
- **Tagging System**: Add facial expressions and custom tags to your concepts
- **3D Model Support**: Upload and preview FBX models with an integrated 3D viewer
- **Library Management**: Save or discard generated images with full metadata
- **Search & Filter**: Find concepts quickly with search and category filtering
- **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Gemini API key (for AI generation)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd concepto
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp env.example .env.local
```

4. Set up Firebase:
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Create a new project or use an existing one
   - Enable Firestore Database
   - Go to Project Settings > General > Your apps
   - Add a web app and copy the config
   - Add your Firebase config to `.env.local`:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   ```

5. Your Gemini API key is already configured for immediate testing.

6. Run the development server:
```bash
npm run dev
```

7. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Generating Concept Art

1. **Enter a Prompt**: Describe your concept art idea in the generation panel
2. **Select Category**: Choose from Characters, Localizations, Gadgets, Textures, or Backgrounds
3. **Add Tags**: Select facial expressions or custom tags to enhance your concept
4. **Set Style**: Optionally specify artistic style (cartoon, realistic, watercolor, etc.)
5. **Generate**: Click "Generate Image" to create your concept art
6. **Review & Save**: Preview the generated image and either save it to your library or discard it

### Managing Your Library

- **Browse by Category**: Use the sidebar to filter concepts by category
- **Search**: Use the search bar to find specific concepts by name, description, or tags
- **View Details**: Click the eye icon to see full concept details
- **Edit Concepts**: Modify names, descriptions, and tags
- **Upload 3D Models**: Add FBX files to your concepts for 3D preview

### 3D Model Viewer

- Upload FBX files to view 3D models
- Interactive controls: rotate, zoom, and pan
- Automatic model centering and scaling

## Project Structure

```
src/
├── app/                 # Next.js app directory
├── components/          # React components
│   ├── ConceptoApp.tsx  # Main application component
│   ├── Sidebar.tsx      # Category and tag sidebar
│   ├── MainContent.tsx  # Concept library display
│   ├── GenerationPanel.tsx # AI generation interface
│   └── ModelViewer.tsx  # 3D model viewer
├── lib/                 # Utility functions
│   ├── utils.ts         # General utilities
│   └── gemini.ts        # AI generation logic
└── types/               # TypeScript type definitions
    └── index.ts         # Application types
```

## Technology Stack

- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **3D Graphics**: Three.js with React Three Fiber
- **AI Integration**: Google Gemini 2.5 Flash Image Preview
- **UI Components**: Custom components with Radix UI primitives
- **Icons**: Lucide React

## API Integration

The app uses **Google Gemini 2.5 Flash Image Preview** for AI-powered concept art generation:

- **Real Image Generation**: Generates actual concept art images using Gemini's latest model
- **Kids TV Show Optimized**: Prompts are enhanced for children's television content
- **Category-Specific**: Different generation styles for characters, locations, gadgets, etc.
- **Tag Integration**: Incorporates facial expressions and custom tags into generation
- **Fallback Support**: Graceful fallback to placeholders if generation fails

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions or support, please open an issue in the repository.