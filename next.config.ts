import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['tldraw'],
  serverExternalPackages: ['@elevenlabs/elevenlabs-js'],
}

export default nextConfig
