import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // tldraw already ships build output. Re-transpiling it in production can
  // cause duplicate module instances, which breaks editor state on Vercel.
  serverExternalPackages: ['@elevenlabs/elevenlabs-js'],
}

export default nextConfig
