/* eslint-disable jsdoc/require-jsdoc */
const nextConfig = {
  basePath: '/examples/appwrite',
  output: 'export',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: config => ({
    ...config,
    resolve: {
      ...config.resolve,
      fallback: {
        fs: false,
      },
    },
  }),
}

module.exports = nextConfig
