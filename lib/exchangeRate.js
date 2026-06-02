import { envNumber } from './env.js';

// In-memory cache (serverless-safe — no filesystem writes)
let rateCache = {
  rate: null,
  timestamp: null,
  source: null,
};

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const FALLBACK_RATE = envNumber('RECTOBOOST_USD_IDR_RATE', 16500);
const API_TIMEOUT_MS = 5000;

function logRate(rate, source, note = '') {
  console.log(`[exchange-rate] ${rate} IDR/USD | ${source} | ${note}`);
}

async function fetchLiveRate() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }
    
    const data = await response.json();
    const rate = Math.round(data.rates.IDR * 100) / 100; // Round to 2 decimals
    
    logRate(rate, 'live', 'Fetched from exchangerate-api.com');
    return rate;
  } catch (err) {
    console.warn('⚠️  Failed to fetch live rate:', err.message);
    return null;
  }
}

function isCacheValid() {
  if (!rateCache.timestamp) return false;
  const age = Date.now() - rateCache.timestamp;
  return age < CACHE_DURATION_MS;
}

export async function getUsdIdrRate() {
  // Return cached rate if valid (within 24 hours)
  if (isCacheValid()) {
    const ageMinutes = Math.round((Date.now() - rateCache.timestamp) / 60000);
    console.log(`📌 Using cached rate: ${rateCache.rate} IDR/USD (${ageMinutes} min old)`);
    return rateCache.rate;
  }

  // Try to fetch live rate
  const liveRate = await fetchLiveRate();
  if (liveRate) {
    rateCache = {
      rate: liveRate,
      timestamp: Date.now(),
      source: 'live'
    };
    return liveRate;
  }

  // Fallback to fixed rate from .env
  if (!rateCache.rate) {
    logRate(FALLBACK_RATE, 'fallback', 'API down/timeout, using .env rate');
    rateCache = {
      rate: FALLBACK_RATE,
      timestamp: Date.now(),
      source: 'fallback'
    };
  }

  return rateCache.rate || FALLBACK_RATE;
}

export function getCachedRate() {
  // Synchronous getter for already-cached rate (no fetch, no wait)
  return rateCache.rate || FALLBACK_RATE;
}

export function getRateSource() {
  return rateCache.source || 'not-initialized';
}

export async function initializeRate() {
  // Call on app startup to pre-fetch rate
  console.log('🚀 Initializing exchange rate...');
  await getUsdIdrRate();
}
