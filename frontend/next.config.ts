import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({
  path: fileURLToPath(new URL('../.env', import.meta.url)),
  quiet: true,
});

const nextConfig: NextConfig = {};

export default nextConfig;
