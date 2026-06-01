import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdf-parse / pdfjs-dist out of the bundle. They do runtime file
  // resolution (loading pdf.worker.mjs) that breaks when Turbopack rewrites
  // their paths into .next/chunks. Marking them external leaves them as plain
  // node_modules requires at runtime, so the worker file resolves correctly.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
