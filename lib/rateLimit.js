// In-memory rate limiter. Works for single-instance deployments.
// Replace with Redis-based limiter if scaling to multiple instances.

const store = new Map();

// Prune expired entries every 5 minutes to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Returns a check function. Call check(key) to test if request is allowed.
 * @param {object} opts
 * @param {number} opts.windowMs   — time window in ms
 * @param {number} opts.max        — max requests per window
 */
export function createRateLimiter({ windowMs = 60_000, max = 10 }) {
  return function check(key) {
    const now   = Date.now();
    const entry = store.get(key) ?? { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true };
    }

    if (entry.count >= max) {
      return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    }

    entry.count++;
    store.set(key, entry);
    return { allowed: true };
  };
}

// Pre-built limiters for common use cases
export const authLimiter    = createRateLimiter({ windowMs: 15 * 60_000, max: 10  }); // 10/15 min
export const forgotLimiter  = createRateLimiter({ windowMs: 10 * 60_000, max: 3   }); // 3/10 min
export const paymentLimiter = createRateLimiter({ windowMs: 60_000,      max: 20  }); // 20/min
