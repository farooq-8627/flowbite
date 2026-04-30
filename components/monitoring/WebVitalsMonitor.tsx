"use client"

import { useEffect } from 'react'
import { onCLS, onFCP, onLCP, onTTFB, onINP, type Metric } from 'web-vitals'
import posthog from 'posthog-js'

/**
 * WebVitalsMonitor - Tracks Core Web Vitals and sends to PostHog
 * 
 * Metrics tracked:
 * - CLS (Cumulative Layout Shift)
 * - FCP (First Contentful Paint)
 * - LCP (Largest Contentful Paint)
 * - TTFB (Time to First Byte)
 * - INP (Interaction to Next Paint) - replaces FID
 */
export function WebVitalsMonitor() {
  useEffect(() => {
    const sendToAnalytics = (metric: Metric) => {
      // Send to PostHog
      posthog.capture('web_vitals', {
        metric_name: metric.name,
        metric_value: metric.value,
        metric_rating: metric.rating,
        metric_delta: metric.delta,
        metric_id: metric.id,
      })

      // Also log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log(`[Web Vitals] ${metric.name}:`, {
          value: metric.value,
          rating: metric.rating,
        })
      }
    }

    // Track all Core Web Vitals
    onCLS(sendToAnalytics)
    onFCP(sendToAnalytics)
    onLCP(sendToAnalytics)
    onTTFB(sendToAnalytics)
    onINP(sendToAnalytics)
  }, [])

  return null
}
