// apps/api/src/config/env.config.ts
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  // App
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3001),
  FRONTEND_URL: z.string().url(),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string(),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // OTP
  OTP_EXPIRY_MINUTES: z.coerce.number().default(5),

  // SMS (Termii)
  TERMII_API_KEY: z.string().optional(),
  TERMII_SENDER_ID: z.string().default('EduSaas'),

  // Identity Verification
  PREMBLY_API_KEY: z.string().optional(),
  PREMBLY_APP_ID: z.string().optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('noreply@edusaas.ng'),
});

// Validate at startup — crash early if env is wrong
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsed.error.format());
  process.exit(1); // Kill the process — do not start with bad config
}

export const env = parsed.data;
export type Env = z.infer<typeof envSchema>;
