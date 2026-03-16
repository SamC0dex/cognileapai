import withBundleAnalyzer from '@next/bundle-analyzer'

const bundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  outputFileTracingRoot: process.cwd(),
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  webpack: (config) => {
    if (config.cache && typeof config.cache === 'object') {
      config.cache = { type: 'memory', maxGenerations: 1 }
    }
    return config
  },
}

export default bundleAnalyzer(nextConfig)
