import pino from 'pino'

/**
 * Centralized logger using Pino
 * 
 * Usage:
 * ```ts
 * import { logger } from '@/lib/logger'
 * 
 * logger.info('User logged in', { userId: '123' })
 * logger.error('Failed to fetch data', { error })
 * logger.debug('Debug info', { data })
 * ```
 */

const isDevelopment = process.env.NODE_ENV === 'development'
const isServer = typeof window === 'undefined'

// Server-side logger with pretty printing in development
export const logger = isServer
  ? pino({
      level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
      transport: isDevelopment
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
      formatters: {
        level: (label) => {
          return { level: label }
        },
      },
    })
  : // Client-side logger (minimal, sends to console)
    {
      debug: (...args: any[]) => isDevelopment && console.debug('[DEBUG]', ...args),
      info: (...args: any[]) => console.info('[INFO]', ...args),
      warn: (...args: any[]) => console.warn('[WARN]', ...args),
      error: (...args: any[]) => console.error('[ERROR]', ...args),
      fatal: (...args: any[]) => console.error('[FATAL]', ...args),
    }

/**
 * Create a child logger with additional context
 * 
 * @example
 * const userLogger = createLogger({ module: 'auth', userId: '123' })
 * userLogger.info('User action', { action: 'login' })
 */
export function createLogger(context: Record<string, any>) {
  if (isServer && logger && 'child' in logger && typeof logger.child === 'function') {
    return logger.child(context)
  }
  
  // Client-side: add context to each log
  return {
    debug: (...args: any[]) => logger.debug(context, ...args),
    info: (...args: any[]) => logger.info(context, ...args),
    warn: (...args: any[]) => logger.warn(context, ...args),
    error: (...args: any[]) => logger.error(context, ...args),
    fatal: (...args: any[]) => logger.fatal(context, ...args),
  }
}

/**
 * Log performance metrics
 */
export function logPerformance(metric: string, duration: number, metadata?: Record<string, any>) {
  logger.info('Performance metric', {
    metric,
    duration,
    ...metadata,
  })
}

/**
 * Log user actions for analytics
 */
export function logUserAction(action: string, metadata?: Record<string, any>) {
  logger.info('User action', {
    action,
    ...metadata,
  })
}

/**
 * Log errors with full context
 */
export function logError(error: Error, context?: Record<string, any>) {
  logger.error({
    err: error,
    message: error.message,
    stack: error.stack,
    ...context,
  })
}
