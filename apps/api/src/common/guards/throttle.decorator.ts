// apps/api/src/common/guards/throttle.decorator.ts

// Throttle and SkipThrottle decorators from '@nestjs/throttler' are used per-route
// See examples in the comments below

// Use these decorators per route to override global limits:

// @Throttle({ default: { ttl: 900000, limit: 5 } })  ← 5 attempts per 15 min
// Perfect for login endpoint

// @SkipThrottle()  ← No rate limit (for health checks etc.)

// Example usage in controller:
/*
  @Post('login')
  @Public()
  @Throttle({ default: { ttl: 900000, limit: 5 } })  // 5 attempts per 15 min
  async login(@Body() dto: LoginDto) { ... }

  @Post('security-recovery')
  @Public()
  @Throttle({ default: { ttl: 3600000, limit: 3 } })  // 3 attempts per hour
  async recover(@Body() dto: RecoveryDto) { ... }
*/
