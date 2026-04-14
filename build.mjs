import yaml from 'js-yaml';
import ogs from 'open-graph-scraper';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const VIDEO_DOMAINS = [
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'vimeo.com',
  'player.vimeo.com',
  'dailymotion.com',
  'www.dailymotion.com',
  'dai.ly',
];

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

/**
 * Returns true if the given URL's hostname matches a known video domain.
 * Matches both exact hostnames and subdomains (e.g. music.youtube.com).
 */
export function isVideoDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return VIDEO_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith('.' + domain),
    );
  } catch {
    return false;
  }
}

/**
 * Returns true if the string is a syntactically valid URL.
 */
export function validateUrl(str) {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// YAML comment header for links.yaml
// ---------------------------------------------------------------------------

const YAML_HEADER = `# =============================================================================
# Link Directory — Curated Links
# =============================================================================
#
# This file contains all the links displayed on the Link Directory website.
# Each link is a list item starting with a dash (-).
#
# HOW TO ADD A LINK:
#   Simply add a new entry with the URL. The build script will automatically
#   fetch the title, description, and image from the page.
#
#   - url: "https://example.com/my-article"
#
# OPTIONAL FIELDS:
#   You can override any of the auto-fetched fields:
#
#   - url: "https://example.com/my-article"
#     type: "news"            # "video" or "news" (auto-detected if omitted)
#     title: "My Custom Title"
#     description: "A short description of the link"
#     image: "https://example.com/image.jpg"
#
# CATEGORIES:
#   type: "video"  — YouTube, Vimeo, Dailymotion links (auto-detected)
#   type: "news"   — Articles, press releases, stories (default)
#
# TIPS:
#   - Lines starting with # are comments and are ignored
#   - Keep one link per entry
#   - Order matters — links appear on the site in the same order as here
# =============================================================================
`;

// ---------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------

/**
 * Merges a LinkEntry's manual overrides with fetched Open Graph data.
 * Override fields from the entry take precedence over OG data.
 *
 * @param {object} entry  - LinkEntry from YAML (url, type, and optional title/description/image)
 * @param {object} ogData - Fetched OG data (ogTitle, ogDescription, ogImage)
 * @returns {object} LinkPreview object { url, type, title, description, image }
 */
export function mergeMetadata(entry, ogData) {
  const ogImage = ogData.ogImage?.[0]?.url ?? ogData.ogImage?.url ?? null;

  return {
    url: entry.url,
    type: entry.type ?? (isVideoDomain(entry.url) ? 'video' : 'news'),
    title: entry.title ?? ogData.ogTitle ?? '',
    description: entry.description ?? ogData.ogDescription ?? '',
    image: entry.image ?? ogImage,
  };
}

/**
 * Returns a fallback LinkPreview when OG fetching fails for a URL.
 * Generates a human-readable title from the URL path when possible.
 *
 * @param {string} url - The URL that failed to fetch
 * @returns {object} { title, description: "", image: null }
 */
export function applyFallback(url) {
  let title;
  try {
    const u = new URL(url);
    // Try to extract a readable title from the last path segment
    const segments = u.pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1] || '';
    // Clean up: remove file extensions, replace hyphens/underscores with spaces, title-case
    const cleaned = lastSegment
      .replace(/\.html?$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
    if (cleaned.length > 3) {
      title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    } else {
      title = u.hostname;
    }
  } catch {
    title = url;
  }

  return {
    title,
    description: '',
    image: null,
  };
}

// ---------------------------------------------------------------------------
// Migration
// ---------------------------------------------------------------------------

/**
 * Reads linkslist.txt, converts each URL to a LinkEntry with auto-detected type,
 * writes the result to links.yaml, and returns a summary object.
 *
 * @param {string} [inputPath='linkslist.txt'] - Path to the plain-text URL file
 * @param {string} [outputPath='links.yaml']   - Path to write the YAML output
 * @returns {{ total: number, video: number, news: number, entries: Array<{url: string, type: string}> }}
 */
export function migrate(inputPath = 'linkslist.txt', outputPath = 'links.yaml') {
  const raw = fs.readFileSync(inputPath, 'utf-8');
  const lines = raw.split('\n');

  const entries = [];
  let videoCount = 0;
  let newsCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const type = isVideoDomain(trimmed) ? 'video' : 'news';
    entries.push({ url: trimmed, type });

    if (type === 'video') {
      videoCount++;
    } else {
      newsCount++;
    }
  }

  const yamlContent = YAML_HEADER + '\n' + yaml.dump(entries, { lineWidth: -1 });
  fs.writeFileSync(outputPath, yamlContent, 'utf-8');

  const summary = `Converted ${entries.length} entries (${videoCount} video, ${newsCount} news)`;
  console.log(summary);

  return { total: entries.length, video: videoCount, news: newsCount, entries };
}

// ---------------------------------------------------------------------------
// YouTube / oEmbed helpers
// ---------------------------------------------------------------------------

const YOUTUBE_DOMAINS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'];

/**
 * Returns true if the URL is a YouTube link.
 */
function isYouTube(url) {
  try {
    const hostname = new URL(url).hostname;
    return YOUTUBE_DOMAINS.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Extracts the YouTube video ID from a URL.
 */
function getYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    return u.searchParams.get('v') || u.pathname.split('/').pop();
  } catch {
    return null;
  }
}

/**
 * Fetches metadata for a YouTube video using the noembed.com API.
 * Returns { title, description, image } or null on failure.
 */
async function fetchYouTubeMetadata(url) {
  try {
    const apiUrl = `https://noembed.com/embed?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.error) return null;
    const videoId = getYouTubeId(url);
    return {
      title: data.title || '',
      description: data.author_name ? `By ${data.author_name}` : '',
      image: videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : (data.thumbnail_url || null),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

/**
 * Reads links.yaml, fetches OG metadata for each entry, and writes
 * the result to site/links-data.json.
 *
 * @param {string} [inputPath='links.yaml']          - Path to the YAML link file
 * @param {string} [outputPath='site/links-data.json'] - Path to write the JSON output
 * @returns {Promise<object[]>} The array of LinkPreview objects written to disk
 */
export async function build(inputPath = 'links.yaml', outputPath = 'site/links-data.json') {
  // 1. Read and parse links.yaml
  let raw;
  try {
    raw = fs.readFileSync(inputPath, 'utf-8');
  } catch (err) {
    console.error(`Fatal: could not read ${inputPath} — ${err.message}`);
    process.exit(1);
  }

  let entries;
  try {
    entries = yaml.load(raw);
  } catch (err) {
    console.error(`Fatal: invalid YAML in ${inputPath} — ${err.message}`);
    process.exit(1);
  }

  // Handle empty file or non-array content
  if (!Array.isArray(entries)) {
    entries = [];
  }

  const results = [];

  // 2. Process each entry sequentially
  for (const entry of entries) {
    // Validate URL
    if (!entry || typeof entry.url !== 'string' || !validateUrl(entry.url)) {
      const display = entry?.url ?? JSON.stringify(entry);
      console.warn(`Warning: skipping malformed entry — ${display}`);
      continue;
    }

    // Auto-detect type when not specified
    if (!entry.type) {
      entry.type = isVideoDomain(entry.url) ? 'video' : 'news';
    }

    // Fetch metadata
    let preview;
    try {
      // Use noembed API for YouTube links (more reliable from CI)
      if (isYouTube(entry.url)) {
        const ytMeta = await fetchYouTubeMetadata(entry.url);
        if (ytMeta) {
          preview = {
            url: entry.url,
            type: entry.type,
            title: entry.title ?? ytMeta.title,
            description: entry.description ?? ytMeta.description,
            image: entry.image ?? ytMeta.image,
          };
        }
      }

      // Fall back to OG scraping for non-YouTube or if YouTube API failed
      if (!preview) {
        const { result } = await ogs({
          url: entry.url,
          timeout: 10000,
          fetchOptions: {
            headers: {
              'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              'accept-language': 'en-US,en;q=0.9',
            },
          },
        });
        preview = mergeMetadata(entry, result);
      }
    } catch {
      // OG fetch failed — apply fallback
      const fallback = applyFallback(entry.url);
      preview = {
        url: entry.url,
        type: entry.type,
        ...fallback,
      };
    }

    results.push(preview);
  }

  // 3. Ensure output directory exists and write JSON
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2), 'utf-8');

  console.log(`Build complete: ${results.length} links written to ${outputPath}`);
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const command = process.argv[2];

if (command === 'migrate') {
  migrate();
} else if (!command) {
  build().catch((err) => {
    console.error(`Fatal: ${err.message}`);
    process.exit(1);
  });
}
