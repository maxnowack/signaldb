/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/todo-example',
  output: 'export',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

module.exports = nextConfig
