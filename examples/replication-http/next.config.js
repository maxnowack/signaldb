// eslint-disable-next-line tsdoc/syntax
/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/examples/replication-http',
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
