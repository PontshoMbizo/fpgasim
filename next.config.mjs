/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained .next/standalone bundle for the Docker image (see Dockerfile).
  output: "standalone",
};

export default nextConfig;
