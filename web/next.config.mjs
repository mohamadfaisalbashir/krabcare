/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bundel server + node_modules seperlunya ke .next/standalone, supaya image
  // ~200MB dan container tidak perlu node_modules lengkap saat runtime.
  output: "standalone",
};

export default nextConfig;
