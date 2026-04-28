// apps/api/src/config/env.config.ts
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 chars'),
  JWT_EXPIRY: z.string().default('15m'),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  FRONTEND_URL: z.string().url(),
});

// This throws at startup if any env var is missing/invalid
export const env = envSchema.parse(process.env);

export type Env = z.infer<typeof envSchema>;
