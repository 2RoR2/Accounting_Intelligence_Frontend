const config = {
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  // Keep Next's file tracing and CSS compilation inside this package in the monorepo.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  devIndicators: false,
  async rewrites() {
    const backend = (process.env.BACKEND_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  webpack(config, { dev }) {
    if (dev) {
      config.cache = false;
    }
    return config;
  },
};
export default config;
