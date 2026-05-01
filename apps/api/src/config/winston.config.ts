// apps/api/src/config/winston.config.ts
import * as winston from 'winston';

const { combine, timestamp, printf, colorize, json } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ level, message, timestamp, context, ...meta }) => {
    const ctx = context ? `[${context}]` : '';
    const extra = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} ${level} ${ctx} ${message} ${extra}`;
  }),
);

const prodFormat = combine(
  timestamp(),
  json(), // JSON logs for log aggregation services (Datadog, Loki)
);

export const winstonConfig: winston.LoggerOptions = {
  level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    // In production, add file transports or remote transports
    ...(process.env.NODE_ENV === 'production'
      ? [
          new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
          }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
};
