// What a MyInstants link is, and what an instant page says: which links are
// taken, the sound file a page plays, and the sound's name.
//
// Pasted links are untrusted. Only the hosts in `allowedHosts` are taken,
// matched exactly, never by suffix (so not `myinstants.com.attacker.com`):
// no other sites, addresses, local names or schemes. Audio found in a page
// must be on those hosts too.

export const allowedHosts = ["myinstants.com", "www.myinstants.com"];

/** What MyInstants serves sounds as; `.mp3` nearly always. */
export const audioExtensions = [
  ".mp3",
  ".ogg",
  ".oga",
  ".opus",
  ".wav",
  ".webm",
  ".m4a",
  ".aac",
  ".flac",
];

/** Why a link or a sound can't be used; the message is shown as it is. */
export class MyInstantsError extends Error {}

/**
 * Turns what was pasted into the link to fetch: trims whitespace, unwraps a
 * Markdown link `[text](url)` or `<url>`, adds `https://` to a bare
 * `myinstants.com/...` address and drops the fragment. The result still has
 * to pass `requireAllowedUrl`.
 */
export function normalizeUrl(input: string): string {
  let url = input.trim();
  const markdown = /^\[[^\]]*\]\(\s*(\S+?)\s*\)$/.exec(url);
  if (markdown !== null) url = markdown[1];
  if (url.startsWith("<") && url.endsWith(">")) {
    url = url.substring(1, url.length - 1).trim();
  }
  if (/^(www\.)?myinstants\.com([/?#]|$)/i.test(url)) url = `https://${url}`;
  const fragment = url.indexOf("#");
  return fragment < 0 ? url : url.substring(0, fragment);
}

function parse(url: string): URL | null {
  try {
    return new URL(url.trim());
  } catch {
    return null;
  }
}

function hostOf(uri: URL): string {
  const host = uri.hostname.toLowerCase();
  return host.endsWith(".") ? host.substring(0, host.length - 1) : host;
}

/**
 * True only for http(s) links whose host is exactly one of `allowedHosts`
 * (case-insensitive, a trailing dot tolerated) on the default port.
 */
export function isAllowedUrl(url: string): boolean {
  const uri = parse(url);
  if (uri === null) return false;
  if (uri.protocol !== "http:" && uri.protocol !== "https:") return false;
  if (uri.port !== "") return false;
  return allowedHosts.includes(hostOf(uri));
}

export function requireAllowedUrl(url: string): void {
  if (!isAllowedUrl(url)) {
    throw new MyInstantsError("Only myinstants.com links are supported");
  }
  const uri = new URL(url.trim());
  if (uri.username !== "" || uri.password !== "") {
    throw new MyInstantsError("The link must not contain credentials");
  }
}

/**
 * A direct link to a sound file, by its path: an audio extension, or a file
 * in `/media/sounds/` (the download checks what it is).
 */
export function looksLikeAudioFileUrl(url: string): boolean {
  const path = parse(url)?.pathname;
  return path !== undefined &&
    (extensionOf(url) !== undefined || /^\/media\/sounds\/[^/]+$/i.test(path));
}

/** The audio extension a link's path ends in (`.mp3`), if any. */
export function extensionOf(url: string): string | undefined {
  const path = parse(url)?.pathname.toLowerCase();
  if (path === undefined) return undefined;
  return audioExtensions.find((ext) => path.endsWith(ext));
}

/** An instant's page: `/instant/<slug>/`, with a language (`/en/`) or not. */
export function isInstantPage(url: string): boolean {
  const path = parse(url)?.pathname;
  return path !== undefined &&
    /^\/(?:[a-z]{2,3}(?:[-_][a-z0-9]+)?\/)?instant\/[^/]+\/?$/i.test(path);
}

/** `url` over https on the default port, as sounds are fetched. */
export function httpsUrl(url: string): string {
  const uri = new URL(url.trim());
  uri.protocol = "https:";
  uri.port = "";
  return uri.href;
}

/**
 * The sound file an instant page plays. In order, most stable first:
 *
 * 1. `<meta property="og:audio" content="...">` (and the name= variant),
 * 2. `onclick="play('/media/sounds/xxx.mp3', …)"`, what the page's own
 *    button plays,
 * 3. `<a href="/media/sounds/xxx.mp3" download>`, in any attribute order.
 *
 * Only an https link on the MyInstants hosts, never another site the page
 * happens to name. Null when there is none.
 */
export function extractAudioUrl(html: string, pageUrl: string): string | null {
  const page = parse(pageUrl) ?? new URL("https://www.myinstants.com/");

  const absolutize = (raw: string): string | null => {
    raw = raw.trim().replaceAll("&amp;", "&");
    if (raw === "") return null;
    let uri: URL;
    try {
      uri = new URL(raw, page);
    } catch {
      return null;
    }
    if (uri.protocol !== "http:" && uri.protocol !== "https:") return null;
    if (!allowedHosts.includes(hostOf(uri))) return null;
    if (uri.username !== "" || uri.password !== "") return null;
    if (!looksLikeAudioPath(uri.pathname)) return null;
    uri.protocol = "https:";
    uri.port = "";
    return uri.href;
  };

  const candidates: (string | undefined)[] = [
    // 1. og:audio, attributes in either order, either quote.
    /<meta\s[^>]*?(?:property|name)\s*=\s*["']og:audio["'][^>]*?content\s*=\s*["']([^"']+)["']/i
      .exec(html)?.[1],
    /<meta\s[^>]*?content\s*=\s*["']([^"']+)["'][^>]*?(?:property|name)\s*=\s*["']og:audio["']/i
      .exec(html)?.[1],
    // 2. The player's hook.
    /play\(\s*['"](\/media\/sounds\/[^'"]+)['"]/i.exec(html)?.[1],
  ];
  for (const candidate of candidates) {
    const url = candidate === undefined ? null : absolutize(candidate);
    if (url !== null) return url;
  }

  // 3. A download link.
  for (const anchor of html.matchAll(/<a\s[^>]*>/gi)) {
    const tag = anchor[0];
    if (!/\sdownload[\s=>/]/i.test(tag)) continue;
    const href = /\shref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const url = href === undefined ? null : absolutize(href);
    if (url !== null) return url;
  }
  return null;
}

function looksLikeAudioPath(path: string): boolean {
  const lower = path.toLowerCase();
  // A /media/sounds/ file without an extension (rare) is fine too: the
  // download checks its content type.
  return audioExtensions.some((ext) => lower.endsWith(ext)) ||
    lower.includes("/media/sounds/");
}

/**
 * The instant's name, from the page's heading (`<h1
 * id="instant-page-title">`), else its `og:title` or `<title>` without the
 * site's (translated) suffix, else the link's slug.
 */
export function titleOf(html: string, pageUrl: string): string {
  const heading =
    /<h1\s[^>]*?id\s*=\s*["']instant-page-title["'][^>]*>([\s\S]*?)<\/h1>/i
      .exec(html)?.[1];
  const og =
    /<meta\s[^>]*?property\s*=\s*["']og:title["'][^>]*?content\s*=\s*(["'])([\s\S]*?)\1/i
      .exec(html)?.[2];
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  for (
    const candidate of [
      heading === undefined ? undefined : text(heading),
      // "VINE BOOM SOUND - Sound Button", "FAAAH - Botão sonoro"
      og === undefined ? undefined : beforeLast(text(og), [" - "]),
      // "VINE BOOM SOUND - Instant Sound Effect Button | Myinstants",
      // "VINE BOOM SOUND: botón de efectos de sonido instantáneos | Myinstants"
      title === undefined ? undefined : beforeLast(
        text(title).replace(/\s*\|\s*myinstants\s*$/i, ""),
        [" - ", ": "],
      ),
    ]
  ) {
    if (candidate !== undefined && candidate !== "") return candidate;
  }
  return titleOfSlug(pageUrl);
}

/** "vine-boom-sound-70972" as "vine boom sound". */
function titleOfSlug(pageUrl: string): string {
  const slug = parse(pageUrl)?.pathname.split("/").filter((s) => s !== "")
    .at(-1);
  const title = slug === undefined
    ? ""
    : safeDecode(slug).replace(/-\d+$/, "").replace(/[-_]+/g, " ").trim();
  return title === "" ? "MyInstants sound" : title;
}

/** A sound file's name ("vine-boom.mp3") as a title ("vine boom"). */
export function titleOfFile(audioUrl: string): string {
  const file = parse(audioUrl)?.pathname.split("/").at(-1) ?? "";
  const title = safeDecode(file).replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ").trim();
  return title === "" ? "MyInstants sound" : title;
}

function safeDecode(text: string): string {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** `text` up to the last of `separators` in it, or all of it. */
function beforeLast(text: string, separators: string[]): string {
  const at = Math.max(...separators.map((s) => text.lastIndexOf(s)));
  return at > 0 ? text.substring(0, at).trim() : text;
}

/** Markup as plain text: no tags, entities decoded, spaces collapsed. */
export function text(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

const namedEntities: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi,
    (entity, name: string) => {
      if (name.startsWith("#")) {
        const code = name[1] === "x" || name[1] === "X"
          ? parseInt(name.substring(2), 16)
          : parseInt(name.substring(1), 10);
        return code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : entity;
      }
      return namedEntities[name.toLowerCase()] ?? entity;
    },
  );
}
