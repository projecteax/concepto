# Concepto - Kids TV Show Concept Art Manager

A comprehensive project management tool for organizing and generating concept art for kids' TV shows. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **AI-Powered Image Generation**: Generate concept art using AI with customizable prompts
- **Character Management**: Create and manage characters with detailed profiles
- **Episode Organization**: Organize content by episodes and seasons
- **Concept Gallery**: Upload and organize concept images with categorization
- **Cloudflare R2 Storage**: Secure file storage with S3-compatible API
- **Firebase Integration**: Real-time database with Firestore
- **Modern UI**: Clean, responsive interface built with Tailwind CSS

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Gemini API key (for AI generation)
- Firebase project
- Cloudflare R2 bucket

### Installation

1. Clone the repository:
```bash
git clone https://github.com/projecteax/concepto.git
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

4. Configure your environment variables in `.env.local`:
   - **Firebase**: Get your config from [Firebase Console](https://console.firebase.google.com/)
   - **Gemini API**: Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
   - **Cloudflare R2**: Set up your R2 bucket and get API credentials

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Character Management

1. **Create Characters**: Add new characters with detailed profiles
2. **Upload Images**: Add main character images and concept art
3. **Organize Concepts**: Categorize concepts by type (pose, clothing, expression, etc.)
4. **Rate Relevance**: Use 1-5 scale to rate concept relevance

### Episode Organization

- **Create Episodes**: Add episodes with descriptions and character assignments
- **Manage Characters**: Assign characters to specific episodes
- **Track Progress**: Monitor episode development status

### Concept Gallery

- **Upload Images**: Drag and drop or browse to upload concept images
- **Categorize**: Organize by concept type (pose, clothing, general, expression, action)
- **Filter & Sort**: Find concepts by category, date, or relevance
- **View Modes**: Switch between grid and list views

## Project Structure

```
src/
├── app/                 # Next.js app directory
├── components/          # React components
│   ├── ConceptoApp.tsx  # Main application component
│   ├── CharacterDetail.tsx # Character management
│   ├── EpisodeList.tsx  # Episode management
│   └── ShowDashboard.tsx # Show overview
├── hooks/               # Custom React hooks
│   ├── useFirebaseData.ts # Firebase data management
│   └── useS3Upload.ts   # File upload handling
├── lib/                 # Utility functions
│   ├── firebase-services.ts # Firebase operations
│   ├── s3-service.ts    # Cloudflare R2 operations
│   └── gemini.ts        # AI generation logic
└── types/               # TypeScript type definitions
    └── index.ts         # Application types
```

## Technology Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Firebase Firestore
- **File Storage**: Cloudflare R2
- **AI Integration**: Google Gemini API
- **UI Components**: Custom components with Lucide React icons

## Setup Guides

- [Cloudflare R2 Setup](CLOUDFLARE_R2_SETUP.md) - Configure file storage
- [AWS S3 Setup](AWS_S3_SETUP.md) - Alternative S3 setup (legacy)

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
