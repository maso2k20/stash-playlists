import type { NextConfig } from "next";
import { execSync } from "child_process";

let commitHash = "unknown";
try {
  commitHash = execSync("git rev-parse --short HEAD").toString().trim();
} catch {
  // not a git repo or git not available (e.g. bare Docker layer)
}

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: {
    // Don’t fail the production build on ESLint errors
    ignoreDuringBuilds: true,
  },
  typescript: { ignoreBuildErrors: true },
  env: {
    NEXT_PUBLIC_COMMIT: commitHash,
  },
};

export default nextConfig;
