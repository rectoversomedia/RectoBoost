/**
 * Maps raw SMMWIZ category strings to a normalized platform group.
 * Used for grouping services in the dashboard UI.
 */

// Platforms blocked from display (Tripay policy: no crypto/gambling)
export const BLOCKED_PLATFORMS = new Set(["Crypto/Web3"]);

// Keywords blocked in service name OR category (case-insensitive)
const BLOCKED_KEYWORDS = [
  // Crypto / Web3
  "crypto","bitcoin","btc","ethereum","eth","nft","web3","binance",
  "coinmarketcap","geckoterminal","bubblemaps","blockchain","defi","token",
  // Gambling
  "casino","gambling","judi","slot","poker","togel","lotre","betting","bet",
  "baccarat","jackpot","taruhan","sweepstake",
  // Negative / harmful actions
  "dislike","dislikes","hate","report","reports","report abuse",
  "ban","unsubscribe","mass unfollow","remove follower","negative review",
  "spam","mass report","flag","flagging",
];

/**
 * Returns true if a service should be HIDDEN (crypto, gambling, etc.)
 */
export function isBlockedService(service) {
  const cat  = (service.category || "").toLowerCase();
  const name = (service.name     || "").toLowerCase();
  const platform = getPlatform(service.category || "");
  if (BLOCKED_PLATFORMS.has(platform)) return true;
  return BLOCKED_KEYWORDS.some((kw) => cat.includes(kw) || name.includes(kw));
}

export const PLATFORM_ORDER = [
  "Instagram",
  "TikTok",
  "YouTube",
  "Facebook",
  "Twitter/X",
  "Telegram",
  "WhatsApp",
  "Spotify",
  "Twitch",
  "Threads",
  "Snapchat",
  "LinkedIn",
  "Reddit",
  "Discord",
  "Pinterest",
  "SoundCloud",
  "Audiomack",
  "Boomplay",
  "Deezer",
  "Apple Music",
  "Shazam",
  "Website Traffic",
  "Google",
  "GitHub",
  "eBay",
  "Other",
];

/** Map platform slug → display label + icon */
export const PLATFORM_META = {
  Instagram:       { label: "Instagram",       icon: "📸", color: "#E1306C" },
  TikTok:          { label: "TikTok",          icon: "🎵", color: "#000000" },
  YouTube:         { label: "YouTube",         icon: "▶️",  color: "#FF0000" },
  Facebook:        { label: "Facebook",        icon: "👤", color: "#1877F2" },
  "Twitter/X":     { label: "Twitter / X",     icon: "🐦", color: "#1DA1F2" },
  Telegram:        { label: "Telegram",        icon: "✈️",  color: "#229ED9" },
  WhatsApp:        { label: "WhatsApp",        icon: "💬", color: "#25D366" },
  Spotify:         { label: "Spotify",         icon: "🎧", color: "#1DB954" },
  Twitch:          { label: "Twitch",          icon: "🎮", color: "#9146FF" },
  Threads:         { label: "Threads",         icon: "🧵", color: "#000000" },
  Snapchat:        { label: "Snapchat",        icon: "👻", color: "#FFFC00" },
  LinkedIn:        { label: "LinkedIn",        icon: "💼", color: "#0A66C2" },
  Reddit:          { label: "Reddit",          icon: "🤖", color: "#FF4500" },
  Discord:         { label: "Discord",         icon: "🎙️", color: "#5865F2" },
  Pinterest:       { label: "Pinterest",       icon: "📌", color: "#E60023" },
  SoundCloud:      { label: "SoundCloud",      icon: "🔊", color: "#FF5500" },
  Audiomack:       { label: "Audiomack",       icon: "🎶", color: "#FFA200" },
  Boomplay:        { label: "Boomplay",        icon: "🎼", color: "#E60012" },
  Deezer:          { label: "Deezer",          icon: "🎸", color: "#EF5466" },
  "Apple Music":   { label: "Apple Music",     icon: "🍎", color: "#FA243C" },
  Shazam:          { label: "Shazam",          icon: "🔵", color: "#0088FF" },
  "Website Traffic": { label: "Website Traffic", icon: "🌐", color: "#6366F1" },
  Google:          { label: "Google",          icon: "🔍", color: "#4285F4" },
  GitHub:          { label: "GitHub",          icon: "🐙", color: "#181717" },
  eBay:            { label: "eBay",            icon: "🛒", color: "#E53238" },
  Other:           { label: "Other",           icon: "⭐", color: "#6B7280" },
};

/**
 * Classify a raw SMMWIZ category string into a normalized platform key.
 * @param {string} category
 * @returns {string} platform key — one of PLATFORM_ORDER values
 */
export function getPlatform(category) {
  const c = (category || "").toLowerCase();

  if (c.includes("instagram"))                                        return "Instagram";
  if (c.includes("tiktok") || c.includes("tik tok") || c.includes("tik-tok")) return "TikTok";
  if (c.includes("youtube") || /\byt\b/.test(c))                     return "YouTube";
  if (c.includes("facebook"))                                         return "Facebook";
  if (c.includes("twitter") || c.includes("x.com") || c.includes("𝕏")) return "Twitter/X";
  if (c.includes("telegram"))                                         return "Telegram";
  if (c.includes("whatsapp"))                                         return "WhatsApp";
  if (c.includes("spotify"))                                          return "Spotify";
  if (c.includes("twitch"))                                           return "Twitch";
  if (c.includes("threads"))                                          return "Threads";
  if (c.includes("snapchat"))                                         return "Snapchat";
  if (c.includes("linkedin"))                                         return "LinkedIn";
  if (c.includes("reddit"))                                           return "Reddit";
  if (c.includes("discord"))                                          return "Discord";
  if (c.includes("pinterest"))                                        return "Pinterest";
  if (c.includes("soundcloud") || c.includes("sound cloud"))         return "SoundCloud";
  if (c.includes("audiomack"))                                        return "Audiomack";
  if (c.includes("boomplay"))                                         return "Boomplay";
  if (c.includes("deezer"))                                           return "Deezer";
  if (c.includes("apple music") || c.includes("apple podcast"))      return "Apple Music";
  if (c.includes("shazam"))                                           return "Shazam";
  if (
    c.includes("website") ||
    c.includes("web traffic") ||
    c.includes("seo") ||
    c.includes("traffic") ||
    c.includes("clv") ||
    c.includes("live visit")
  )                                                                   return "Website Traffic";
  if (c.includes("google"))                                           return "Google";
  if (
    c.includes("coinmarketcap") ||
    c.includes("binance") ||
    c.includes("crypto") ||
    c.includes("bubblemaps") ||
    c.includes("geckoterminal") ||
    c.includes("web3")
  )                                                                   return "Crypto/Web3";
  if (c.includes("github"))                                           return "GitHub";
  if (c.includes("ebay"))                                             return "eBay";

  return "Other";
}

/**
 * Group an array of services (from DB or SMMWIZ API) by platform.
 * @param {Array} services
 * @returns {Record<string, Array>} { Instagram: [...], TikTok: [...], ... }
 */
export function groupServicesByPlatform(services) {
  const groups = {};
  for (const platform of PLATFORM_ORDER) {
    groups[platform] = [];
  }

  for (const service of services) {
    const platform = getPlatform(service.category || "");
    if (!groups[platform]) groups[platform] = [];
    groups[platform].push(service);
  }

  // Remove empty groups
  for (const key of Object.keys(groups)) {
    if (groups[key].length === 0) delete groups[key];
  }

  return groups;
}
