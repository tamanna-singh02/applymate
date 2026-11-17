import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep these server-only libraries out of the bundler; they run in Node as-is.
  serverExternalPackages: ["unpdf", "mammoth", "pdf-lib"],
};

export default nextConfig;
