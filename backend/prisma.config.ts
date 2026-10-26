import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

if (!process.env.DATABASE_URL && !process.argv.includes('seed')) {
  config({
    path: fileURLToPath(new URL('.env', import.meta.url)),
    quiet: true,
  });
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: `node --input-type=module --eval=import('${new URL('prisma/seed.mjs', import.meta.url).href}')`,
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
