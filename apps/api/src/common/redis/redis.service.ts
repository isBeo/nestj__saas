// apps/api/src/common/redis/redis.service.ts
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Redis } from 'ioredis';
import { env } from '../../config/env.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  public client: Redis; // public so RedisModule can expose it to BullMQ

  constructor() {
    this.client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 5) {
          this.logger.error('Redis: max retries reached');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000); // Exponential backoff
      },
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNRESET'];
        return targetErrors.some((e) => err.message.includes(e));
      },
    });

    this.client.on('connect', () => this.logger.log('✅ Redis connected'));
    this.client.on('ready', () => this.logger.log('✅ Redis ready'));
    this.client.on('error', (err) =>
      this.logger.error(`❌ Redis error: ${err.message}`),
    );
    this.client.on('close', () =>
      this.logger.warn('⚠️ Redis connection closed'),
    );
  }

  async onModuleInit() {
    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  // ─── Core Operations ─────────────────────────────────────

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) await this.client.del(...keys);
  }

  async exists(key: string): Promise<boolean> {
    const count = await this.client.exists(key);
    return count > 0;
  }

  async ttl(key: string): Promise<number> {
    return this.client.ttl(key);
  }

  // ─── Atomic Counter (for rate limiting) ──────────────────

  async incr(key: string): Promise<number> {
    return this.client.incr(key);
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.client.expire(key, seconds);
  }

  // ─── Hash Operations (for user profiles) ─────────────────

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  // ─── Pub/Sub (for device notifications) ──────────────────

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  // ─── Pattern-based key deletion ──────────────────────────

  async deleteByPattern(pattern: string): Promise<void> {
    const keys = await this.client.keys(pattern);
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  // ─── Session Helpers (Domain-specific methods) ───────────

  sessionKey(userId: string) {
    return `session:${userId}`;
  }

  otpKey(userId: string, purpose: string) {
    return `otp:${userId}:${purpose}`;
  }

  rateLimitKey(action: string, identifier: string) {
    return `rate:${action}:${identifier}`;
  }

  deviceTerminationKey(userId: string) {
    return `device:terminated:${userId}`;
  }
}
