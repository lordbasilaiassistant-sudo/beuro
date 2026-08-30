import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Pin the workspace root: without it Next walks up and picks up an
  // unrelated lockfile from a parent directory.
  turbopack: { root: __dirname },
  // src/ typechecks clean — keep it that way. Flip to true only to unblock
  // a genuine emergency, never as the default.
  typescript: { ignoreBuildErrors: false },
  reactStrictMode: false,
}

export default nextConfig
