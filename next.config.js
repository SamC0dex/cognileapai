import withBundleAnalyzer from '@next/bundle-analyzer'

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Temporarily disabled to avoid hydration issues with browser extensions
  outputFileTracingRoot: process.cwd(),
  eslint: {
    // Warning: Temporarily ignoring ESLint errors during builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Warning: Temporarily ignoring TypeScript errors during builds
    ignoreBuildErrors: true,
  },
  webpack: (config) => {
    // Fix case sensitivity issues on Windows
    config.resolve.symlinks = false

    if (config.cache && typeof config.cache === 'object') {
      config.cache = {
        type: 'memory',
        maxGenerations: 1,
      }
    }

    return config
  },
};

export default bundleAnalyzer(nextConfig);
