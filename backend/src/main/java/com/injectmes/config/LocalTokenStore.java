package com.injectmes.config;

import org.springframework.stereotype.Component;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * 本地Token存储（Redis未安装时的替代方案）
 * 使用ConcurrentHashMap模拟Redis的token存储功能
 */
@Component
public class LocalTokenStore {

    private static final Map<String, CacheEntry> CACHE = new ConcurrentHashMap<>();

    public void set(String key, String value) {
        CACHE.put(key, new CacheEntry(value, null));
    }

    public void set(String key, String value, long timeout, TimeUnit unit) {
        long expireAt = System.currentTimeMillis() + unit.toMillis(timeout);
        CACHE.put(key, new CacheEntry(value, expireAt));
    }

    public String get(String key) {
        evictExpired(key);
        CacheEntry entry = CACHE.get(key);
        return entry == null ? null : entry.value;
    }

    public Boolean delete(String key) {
        return CACHE.remove(key) != null;
    }

    public Boolean hasKey(String key) {
        evictExpired(key);
        return CACHE.containsKey(key);
    }

    public Set<String> keys(String pattern) {
        if (pattern.endsWith("*")) {
            String prefix = pattern.substring(0, pattern.length() - 1);
            return CACHE.keySet().stream()
                    .filter(k -> k.startsWith(prefix))
                    .collect(Collectors.toCollection(HashSet::new));
        }
        return CACHE.containsKey(pattern) ? Set.of(pattern) : Collections.emptySet();
    }

    private void evictExpired(String key) {
        CacheEntry entry = CACHE.get(key);
        if (entry != null && entry.expireAt != null && System.currentTimeMillis() > entry.expireAt) {
            CACHE.remove(key);
        }
    }

    private static class CacheEntry {
        final String value;
        final Long expireAt;

        CacheEntry(String value, Long expireAt) {
            this.value = value;
            this.expireAt = expireAt;
        }
    }
}
