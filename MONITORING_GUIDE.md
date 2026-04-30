# Monitoring & Analytics Guide

**Last Updated**: April 30, 2026  
**Status**: Complete Monitoring Infrastructure

---

## 📊 Overview

FlowBite has comprehensive monitoring and analytics across three systems:

1. **Sentry** - Error tracking and performance monitoring
2. **PostHog** - Product analytics and feature flags
3. **Pino** - Application logging

---

## 🐛 Sentry (Error Tracking)

### Configuration

Sentry is configured in three files:
- `sentry.client.config.ts` - Browser errors
- `sentry.server.config.ts` - Server errors
- `sentry.edge.config.ts` - Edge runtime errors

### Features Enabled

✅ **Error Tracking**
- Automatic error capture
- Source maps for stack traces
- Error grouping and deduplication

✅ **Performance Monitoring**
- Transaction tracking
- Web Vitals monitoring
- API performance tracking

✅ **Session Replay** (optional)
- User session recordings
- Error replay
- Performance replay

### Usage

```typescript
import * as Sentry from '@sentry/nextjs'

// Capture custom error
try {
  // risky operation
} catch (error) {
  Sentry.captureException(error, {
    tags: { feature: 'auth' },
    extra: { userId: '123' },
  })
}

// Add breadcrumb
Sentry.addBreadcrumb({
  message: 'User clicked button',
  level: 'info',
})

// Set user context
Sentry.setUser({
  id: '123',
  email: 'user@example.com',
})
```

### Environment Variables

```bash
SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
```

### Dashboard

Access your Sentry dashboard at: https://sentry.io/organizations/your-org/

---

## 📈 PostHog (Product Analytics)

### Configuration

PostHog is configured in:
- `components/providers/PostHogProvider.tsx` - Provider setup
- `lib/posthog-server.ts` - Server-side client

### Features Enabled

✅ **Event Tracking**
- Automatic pageview tracking
- Custom event tracking
- User identification

✅ **Feature Flags**
- Server-side flag evaluation
- Client-side flag evaluation
- A/B testing support

✅ **Session Recording**
- User session recordings
- Heatmaps
- Rage clicks detection

✅ **Web Vitals**
- Automatic Core Web Vitals tracking
- Performance monitoring

### Automatic Tracking

The following events are tracked automatically:

1. **Web Vitals** (`components/monitoring/WebVitalsMonitor.tsx`)
   - CLS (Cumulative Layout Shift)
   - FID (First Input Delay)
   - FCP (First Contentful Paint)
   - LCP (Largest Contentful Paint)
   - TTFB (Time to First Byte)
   - INP (Interaction to Next Paint)

2. **Preferences** (`components/monitoring/PreferencesAnalytics.tsx`)
   - `preferences_loaded` - Initial preferences
   - `theme_preset_changed` - Theme preset changes
   - `theme_mode_changed` - Light/dark mode changes
   - `font_changed` - Font changes
   - `sidebar_variant_changed` - Sidebar variant changes
   - `content_layout_changed` - Layout changes
   - `radius_changed` - Border radius changes

3. **Pageviews** (automatic via PostHogPageView)
   - All route changes tracked
   - Referrer tracking
   - UTM parameter tracking

### Custom Event Tracking

```typescript
import posthog from 'posthog-js'

// Track custom event
posthog.capture('button_clicked', {
  button_name: 'submit',
  page: 'dashboard',
})

// Identify user
posthog.identify('user-123', {
  email: 'user@example.com',
  name: 'John Doe',
})

// Set user properties
posthog.setPersonProperties({
  plan: 'pro',
  company: 'Acme Inc',
})

// Track feature flag
const showNewFeature = posthog.isFeatureEnabled('new-feature')
```

### Environment Variables

```bash
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_...
NEXT_PUBLIC_POSTHOG_HOST=https://us.posthog.com
```

### Dashboard

Access your PostHog dashboard at: https://us.posthog.com/

---

## 📝 Pino (Application Logging)

### Configuration

Logging is configured in `lib/logger.ts`

### Features

✅ **Structured Logging**
- JSON format in production
- Pretty printing in development
- Log levels (debug, info, warn, error, fatal)

✅ **Context Logging**
- Child loggers with context
- Request ID tracking
- User ID tracking

✅ **Performance Logging**
- Duration tracking
- Metric logging

### Usage

```typescript
import { logger, createLogger, logError, logPerformance } from '@/lib/logger'

// Basic logging
logger.info('User logged in', { userId: '123' })
logger.error('Failed to fetch data', { error })
logger.debug('Debug info', { data })

// Child logger with context
const userLogger = createLogger({ module: 'auth', userId: '123' })
userLogger.info('User action', { action: 'login' })

// Error logging
try {
  // risky operation
} catch (error) {
  logError(error, { context: 'auth', userId: '123' })
}

// Performance logging
const start = Date.now()
// ... operation
logPerformance('api_call', Date.now() - start, { endpoint: '/api/users' })
```

### Log Levels

```bash
# Set log level via environment variable
LOG_LEVEL=debug  # debug, info, warn, error, fatal
```

### Development

In development, logs are pretty-printed to console:
```
[INFO] 10:30:45 User logged in
  userId: "123"
  email: "user@example.com"
```

### Production

In production, logs are JSON formatted:
```json
{"level":"info","time":1234567890,"msg":"User logged in","userId":"123"}
```

---

## 📊 Monitoring Dashboard

### Key Metrics to Monitor

#### Sentry
- Error rate
- Error types
- Affected users
- Performance issues
- Transaction duration

#### PostHog
- Daily active users (DAU)
- Weekly active users (WAU)
- Feature usage
- Conversion rates
- User retention

#### Logs
- Error frequency
- API response times
- User actions
- System health

---

## 🚨 Alerts

### Sentry Alerts

Configure alerts in Sentry dashboard:
1. Go to Alerts → Create Alert Rule
2. Set conditions (e.g., error rate > 10/min)
3. Set notification channels (email, Slack, etc.)

### PostHog Alerts

Configure alerts in PostHog dashboard:
1. Go to Insights → Create Alert
2. Set metric threshold
3. Set notification channels

---

## 🔍 Debugging

### Finding Errors

1. **Sentry Dashboard**
   - View all errors
   - Filter by user, browser, OS
   - View stack traces
   - View breadcrumbs

2. **PostHog Dashboard**
   - View user sessions
   - Watch session recordings
   - View event timeline

3. **Logs**
   - Search logs by level, module, user
   - View structured data
   - Trace request flow

### Common Issues

#### High Error Rate
1. Check Sentry for error details
2. Check affected users
3. Check recent deployments
4. Review error stack traces

#### Poor Performance
1. Check Web Vitals in PostHog
2. Check transaction duration in Sentry
3. Check API response times in logs
4. Review performance metrics

#### Low Engagement
1. Check DAU/WAU in PostHog
2. Check feature usage
3. Check user retention
4. Review session recordings

---

## 📈 Analytics Events

### User Events

```typescript
// Sign up
posthog.capture('user_signed_up', {
  method: 'email',
  plan: 'free',
})

// Feature usage
posthog.capture('feature_used', {
  feature: 'export',
  format: 'csv',
})

// Conversion
posthog.capture('conversion', {
  from: 'free',
  to: 'pro',
  revenue: 29.99,
})
```

### System Events

```typescript
// API call
logger.info('API call', {
  endpoint: '/api/users',
  method: 'GET',
  duration: 123,
  status: 200,
})

// Error
logger.error('API error', {
  endpoint: '/api/users',
  error: error.message,
  status: 500,
})
```

---

## 🎯 Best Practices

### Error Tracking

1. **Add context to errors**
   ```typescript
   Sentry.captureException(error, {
     tags: { feature: 'auth' },
     extra: { userId, email },
   })
   ```

2. **Use breadcrumbs**
   ```typescript
   Sentry.addBreadcrumb({
     message: 'User clicked button',
     level: 'info',
   })
   ```

3. **Set user context**
   ```typescript
   Sentry.setUser({ id, email })
   ```

### Analytics

1. **Track user actions**
   ```typescript
   posthog.capture('button_clicked', { button: 'submit' })
   ```

2. **Identify users**
   ```typescript
   posthog.identify(userId, { email, name })
   ```

3. **Use feature flags**
   ```typescript
   const enabled = posthog.isFeatureEnabled('new-feature')
   ```

### Logging

1. **Use appropriate log levels**
   - `debug` - Development info
   - `info` - Normal operations
   - `warn` - Warnings
   - `error` - Errors
   - `fatal` - Critical errors

2. **Add context**
   ```typescript
   logger.info('User action', { userId, action, timestamp })
   ```

3. **Use child loggers**
   ```typescript
   const moduleLogger = createLogger({ module: 'auth' })
   ```

---

## 🔐 Privacy & Compliance

### Data Collection

- **Sentry**: Error messages, stack traces, user IDs (no PII)
- **PostHog**: Events, user IDs, session recordings (configurable)
- **Logs**: User actions, API calls (no sensitive data)

### GDPR Compliance

1. **User consent**: Obtain consent before tracking
2. **Data deletion**: Support user data deletion requests
3. **Data export**: Support user data export requests
4. **Anonymization**: Anonymize user data when possible

### Configuration

```typescript
// Disable session recording for sensitive pages
posthog.config.disable_session_recording = true

// Mask sensitive data in Sentry
Sentry.init({
  beforeSend(event) {
    // Remove sensitive data
    delete event.user?.email
    return event
  },
})
```

---

## 📚 Resources

### Documentation
- [Sentry Docs](https://docs.sentry.io/)
- [PostHog Docs](https://posthog.com/docs)
- [Pino Docs](https://getpino.io/)
- [Web Vitals](https://web.dev/vitals/)

### Dashboards
- Sentry: https://sentry.io/
- PostHog: https://us.posthog.com/
- Logs: Check your log aggregation service

---

**Status**: ✅ Monitoring infrastructure complete and operational
