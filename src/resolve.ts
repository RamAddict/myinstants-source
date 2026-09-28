// `resolve`: the sound a pasted MyInstants link holds, as one track. An
// instant page is read for its sound file and name; a direct link to a
// sound file is taken as it is, without a request.
import { type Fetcher, get, readText } from "./http.ts";
import {
  extractAudioUrl,
  httpsUrl,
  isInstantPage,
  looksLikeAudioFileUrl,
  MyInstantsError,
  normalizeUrl,
  requireAllowedUrl,
  titleOf,
  titleOfFile,
} from "./myinstants.ts";
import { log } from "./process.ts";

/** A `resolve` answer's track, as protocol 1 names its fields. */
export interface Track {
  source: string;
  title: string;
  durationMs?: number;
  thumbnail?: string;
  link?: string;
}

/** Protocol 1: `source` travels to everyone in the call, at most 900 chars. */
export const maxSourceLength = 900;

/** An instant page is about 50 KB. */
const maxPageBytes = 2 * 1024 * 1024;

export async function resolve(
  input: string,
  fetcher: Fetcher = fetch,
): Promise<Track[]> {
  const url = normalizeUrl(input);
  log(`input "${input.trim()}" -> ${url}`);
  requireAllowedUrl(url);
  if (looksLikeAudioFileUrl(url)) {
    return [checked({ source: httpsUrl(url), title: titleOfFile(url) })];
  }
  if (!isInstantPage(url)) {
    throw new MyInstantsError(
      "Paste the link of one sound's page on MyInstants (…/instant/…)",
    );
  }
  const page = await get(url, "page", fetcher);
  const html = await readText(
    page.response,
    maxPageBytes,
    new URL(page.url).hostname,
  );
  const audio = extractAudioUrl(html, page.url);
  log(`audio url: ${audio ?? "none found"}`);
  if (audio === null) {
    throw new MyInstantsError("Could not find audio on that MyInstants page");
  }
  return [
    checked({ source: audio, title: titleOf(html, page.url), link: page.url }),
  ];
}

function checked(track: Track): Track {
  if (track.source.length > maxSourceLength) {
    throw new MyInstantsError("That MyInstants link is too long");
  }
  return track;
}
