/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable image optimization for better compatibility
  images: {
    unoptimized: true,
  },
  
  // Output configuration for deployment
  output: 'standalone',
  
  // Webpack configuration for better stability
  webpack: (config, { dev, isServer }) => {
    if (dev) {
      // Disable webpack cache in development to prevent stale cache issues
      config.cache = false;
    }
    return config;
  },
};

module.exports = nextConfig;
