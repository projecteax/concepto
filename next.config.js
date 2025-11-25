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
    
    // Exclude FFmpeg binaries from bundling (they're loaded at runtime)
    if (isServer) {
      config.externals = config.externals || [];
      // Make sure ffmpeg-static is treated as external (not bundled)
      if (typeof config.externals === 'function') {
        const originalExternals = config.externals;
        config.externals = (context, request, callback) => {
          if (request === 'ffmpeg-static') {
            return callback(null, 'commonjs ' + request);
          }
          return originalExternals(context, request, callback);
        };
      } else {
        config.externals.push('ffmpeg-static');
      }
    }
    
    return config;
  },
};

module.exports = nextConfig;
