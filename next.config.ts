import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['tldraw'],
  serverExternalPackages: ['@google-cloud/text-to-speech'],
}

export default nextConfig
