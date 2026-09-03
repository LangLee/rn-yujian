import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Cache Service
 * Handles offline data caching using AsyncStorage
 * Implements cache read/write functions and cache invalidation
 */

// Cache keys
const CACHE_KEYS = {
  USER_PREFERENCES: 'cache:user:preferences',
} as const;

// Cache expiration time (in milliseconds)
const CACHE_EXPIRATION_TIME = 5 * 60 * 1000; // 5 minutes

export interface CacheError {
  message: string;
  key?: string;
}

/**
 * Cache Service Class
 * Provides methods for caching and retrieving data from AsyncStorage
 */
class CacheService {
  /**
   * Cache a single item with a custom key
   * @param key - Cache key
   * @param value - Value to cache (will be JSON stringified)
   * @throws CacheError if caching fails
   */
  async cacheItem<T>(key: string, value: T): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      throw {
        message: 'Failed to cache item',
        key,
      } as CacheError;
    }
  }

  /**
   * Get a cached item by key
   * @param key - Cache key
   * @returns Cached value or null if not found
   */
  async getCachedItem<T>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      if (!value) {
        return null;
      }
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Error getting cached item for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Remove a cached item by key
   * @param key - Cache key
   */
  async removeCachedItem(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error(`Error removing cached item for key ${key}:`, error);
    }
  }

  /**
   * Clear all cache
   * WARNING: This will clear ALL AsyncStorage data
   */
  async clearAllCache(): Promise<void> {
    try {
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Error clearing all cache:', error);
    }
  }

  /**
   * Get all cache keys
   * @returns Array of all cache keys
   */
  async getAllCacheKeys(): Promise<readonly string[]> {
    try {
      return await AsyncStorage.getAllKeys();
    } catch (error) {
      console.error('Error getting all cache keys:', error);
      return [];
    }
  }

  /**
   * Check if cache exists and is valid for a given key
   * @param key - Cache key
   * @param expirationTime - Optional custom expiration time in milliseconds
   * @returns true if cache exists and is valid, false otherwise
   */
  async isCacheValid(
    key: string,
    expirationTime: number = CACHE_EXPIRATION_TIME,
  ): Promise<boolean> {
    try {
      const timestampKey = `${key}:timestamp`;
      const timestampStr = await AsyncStorage.getItem(timestampKey);

      if (!timestampStr) {
        return false;
      }

      const timestamp = parseInt(timestampStr, 10);
      const now = Date.now();
      return now - timestamp <= expirationTime;
    } catch (error) {
      console.error('Error checking cache validity:', error);
      return false;
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export { CACHE_KEYS, CACHE_EXPIRATION_TIME };
