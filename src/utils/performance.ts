/**
 * Performance optimization utilities
 * Provides helpers for lazy loading, memoization, and performance monitoring
 */

import { useEffect, useRef } from 'react';

/**
 * Debounce function to limit how often a function can be called
 * Useful for search inputs, scroll handlers, etc.
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => {
      func(...args);
    }, wait);
  };
};

/**
 * Throttle function to ensure a function is called at most once per interval
 * Useful for scroll handlers, resize handlers, etc.
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number,
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

/**
 * Hook to measure component render time
 * Useful for identifying performance bottlenecks
 */
export const useRenderTime = (componentName: string) => {
  const renderCount = useRef(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;
    const endTime = Date.now();
    const renderTime = endTime - startTime.current;

    if (__DEV__) {
      console.log(
        `[Performance] ${componentName} render #${renderCount.current}: ${renderTime}ms`,
      );
    }

    startTime.current = Date.now();
  });
};

/**
 * Preload a lazy-loaded component
 * Call this to preload components before they're needed
 */
export const preloadComponent = (
  lazyComponent: React.LazyExoticComponent<any>,
) => {
  // Trigger the lazy load by accessing the component
  const preloadPromise = (lazyComponent as any)._payload?._result;
  if (!preloadPromise) {
    // If not already loaded, trigger the load
    (lazyComponent as any)._init?.((lazyComponent as any)._payload);
  }
};

/**
 * Batch state updates to reduce re-renders
 * React 18+ automatically batches updates, but this can be useful for older versions
 */
export const batchUpdates = (callback: () => void) => {
  // In React Native, updates are already batched
  // This is a no-op but kept for API consistency
  callback();
};
