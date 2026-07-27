import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@weighbridge/database", "@weighbridge/shared-types", "@weighbridge/mqtt-topics"],
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};
export default nextConfig;
