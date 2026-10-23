/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // javascript-lp-solver (staff ILP) mentions these for an external solver mode we never use.
    resolveAlias: {
      fs: { browser: "./lib/empty-module.ts" },
      child_process: { browser: "./lib/empty-module.ts" },
    },
  },
};
export default nextConfig;
