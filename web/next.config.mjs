/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Bundel server + node_modules seperlunya ke .next/standalone: image ~200MB
  // bukan ~1GB, dan container tidak perlu node_modules lengkap saat runtime.
  output: "standalone",
};

export default nextConfig;
