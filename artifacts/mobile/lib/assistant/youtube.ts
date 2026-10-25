/**
 * YouTube search & link detection helper for JARVIS AI.
 */

export interface YouTubeIntent {
  query: string;
  url: string;
}

const SONG_PATTERNS = [
  /play\s+(.+?)(?:on\s+youtube|$)/i,
  /open\s+youtube\s*(?:for|and\s+search|and\s+play)?\s*(.*)/i,
  /youtube\s*(?:a|e|-e)?\s*(.+?)(?:গান|প্লে|চালান|খুলুন|সার্চ|দেখান|$)/i,
  /(.+?)(?:গানটি|গান|মিউজিক|গানটা)\s*(?:ইউটিউবে|youtube|play|প্লে|চালান|খুলুন|সার্চ|শুনুন)/i,
  /(?:ইউটিউবে|youtube-এ|youtube-এ|youtube)\s*(.+?)\s*(?:গান|ভিডিও|সার্চ|প্লে|খুলুন)/i,
];

export function extractYouTubeIntent(text: string): YouTubeIntent | null {
  if (!text) return null;
  const trimmed = text.trim();

  for (const pattern of SONG_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match && match[1]) {
      const query = match[1]
        .replace(/^(গান|মিউজিক|ভিডিও|গানটি|গানটা|প্লে|চালান|খুলুন|সার্চ|দেখান|শুনুন)\s+/i, '')
        .replace(/\s+(গান|মিউজিক|ভিডিও|গানটি|গানটা|প্লে|চালান|খুলুন|সার্চ|দেখান|শুনুন)$/i, '')
        .trim();

      if (query.length > 0) {
        return {
          query,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
        };
      }
    }
  }

  // Fallback: If user asks generally to open YouTube or play music
  if (
    /youtube|ইউটিউব/i.test(trimmed) &&
    /play|open|খুলুন|চালান|প্লে|গান|মিউজিক/i.test(trimmed)
  ) {
    const cleanedQuery = trimmed
      .replace(/youtube|ইউটিউব|খুলুন|চালান|প্লে|গান|মিউজিক|play|open/gi, '')
      .trim();

    const query = cleanedQuery.length > 0 ? cleanedQuery : 'Bangla songs';
    return {
      query,
      url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    };
  }

  return null;
}
