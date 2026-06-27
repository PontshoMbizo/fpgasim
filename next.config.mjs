// Origins allowed to embed this simulator in an <iframe>. scope.io frames it
// from the /tools area. Comma-separate extra origins via FRAME_ANCESTORS;
// 'self' is always allowed. Defaults to the scope.io local-dev origin.
const frameAncestors = ["'self'", ...(process.env.FRAME_ANCESTORS || "http://localhost:3000").split(",").map((s) => s.trim()).filter(Boolean)].join(" ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Emit a self-contained .next/standalone bundle for the Docker image (see Dockerfile).
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `frame-ancestors ${frameAncestors};` },
        ],
      },
    ];
  },
};

export default nextConfig;
