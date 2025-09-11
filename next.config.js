/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable turbopack in development for better stability
  turbopack: {
    // Disable turbopack to prevent manifest issues
    enabled: false,
  },
  
  // Optimize for development stability
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Disable webpack cache in development to prevent stale cache issues
      config.cache = false;
      
      // Add better error handling
      config.stats = 'errors-warnings';
    }
    return config;
  },
  
  // Disable static optimization in development
  output: 'standalone',
  
  // Add better error handling
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
  
  // Disable image optimization in development to prevent issues
  images: {
    unoptimized: true,
  },
  
  // Add better logging
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

module.exports = nextConfig;
