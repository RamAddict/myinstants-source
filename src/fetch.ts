// `fetch`: one sound, written to `<directory>/<name>.<ext>` in place,
// announced (`started`) before its first byte and `done` once the whole
// file is there.
import { failure, type Fetcher, get, RequestError } from "./http.ts";
import {
  extensionOf,
  looksLikeAudioFileUrl,
  MyInstantsError,
  normalizeUrl,
  requireAllowedUrl,
} from "./myinstants.ts";
import { log } from "./process.ts";
import type { FetchRequest } from "./protocol.ts";
import { resolve } from "./resolve.ts";

/** Largest file taken: the soundboard trims longer sounds down itself. */
export const maxSourceBytes = 3 * 1024 * 1024;

export interface Started {
  path: string;
  size?: number;
  durationMs?: number;
  title?: string;
}

export type FetchEvent = { started: Started } | { done: { path: string } };

const extensionsByType: Record<string, string> = {
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/ogg": ".ogg",
  "audio/vorbis": ".ogg",
  "audio/opus": ".opus",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/wave": ".wav",
  "audio/webm": ".webm",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/flac": ".flac",
};

/** The content type without parameters, lower case; null when absent. */
export function mimeOf(contentType: string | null): string | null {
  if (contentType === null) return null;
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return mime === "" ? null : mime;
}

/** Audio, or bytes the server doesn't name; no content type is fine too. */
export function isAudioType(mime: string | null): boolean {
  return mime === null || mime.startsWith("audio/") ||
    mime === "application/octet-stream" || mime === "binary/octet-stream";
}

export async function fetchSound(
  request: FetchRequest,
  emit: (event: FetchEvent) => void,
  fetcher: Fetcher = fetch,
): Promise<void> {
  // Trusted or not, only ever MyInstants.
  const source = normalizeUrl(request.source);
  requireAllowedUrl(source);
  // A page link (queued as pasted) is read for its sound first.
  const audioUrl = looksLikeAudioFileUrl(source)
    ? source
    : (await resolve(source, fetcher))[0].source;

  const { response, url } = await get(audioUrl, "audio", fetcher);
  const host = new URL(url).hostname;
  const mime = mimeOf(response.headers.get("content-type"));
  if (!isAudioType(mime)) {
    await response.body?.cancel();
    throw new MyInstantsError(`Not an audio file (${mime})`);
  }
  const size = exactSize(response);
  if (size !== undefined && size > maxSourceBytes) {
    await response.body?.cancel();
    throw new MyInstantsError("Audio file too large (max 3 MB)");
  }
  if (size === 0) {
    await response.body?.cancel();
    throw new MyInstantsError("Downloaded file is empty");
  }
  const ext = extensionOf(url) ?? extensionOf(audioUrl) ??
    (mime !== null ? extensionsByType[mime] : undefined) ?? ".mp3";
  const path = join(request.directory, `${request.name}${ext}`);
  log(`writing ${path} (${size ?? "unknown"} bytes, ${mime})`);

  await Deno.mkdir(request.directory, { recursive: true });
  emit({ started: size === undefined ? { path } : { path, size } });
  const file = await Deno.open(path, {
    write: true,
    create: true,
    truncate: true,
  });
  let written = 0;
  try {
    try {
      for await (const chunk of response.body ?? []) {
        written += chunk.length;
        // Leaving the loop cancels the rest of the body.
        if (written > maxSourceBytes) {
          throw new MyInstantsError("Audio file too large (max 3 MB)");
        }
        await writeAll(file, chunk);
      }
    } catch (e) {
      throw failure(e, host);
    }
    if (written === 0) throw new MyInstantsError("Downloaded file is empty");
    if (size !== undefined && written !== size) {
      throw new RequestError(
        `The download from ${host} ended early (${written} of ${size} bytes)`,
      );
    }
  } catch (e) {
    file.close();
    await Deno.remove(path).catch(() => {});
    throw e;
  }
  file.close();
  log(`wrote ${written} bytes`);
  emit({ done: { path } });
}

/**
 * The body's length in bytes, when the server says it exactly: not for a
 * compressed body, which fetch hands us decompressed.
 */
function exactSize(response: Response): number | undefined {
  const encoding = response.headers.get("content-encoding");
  if (encoding !== null && encoding.trim().toLowerCase() !== "identity") {
    return undefined;
  }
  const length = response.headers.get("content-length");
  if (length === null || !/^\s*\d+\s*$/.test(length)) return undefined;
  const size = Number(length);
  return Number.isSafeInteger(size) ? size : undefined;
}

async function writeAll(file: Deno.FsFile, bytes: Uint8Array): Promise<void> {
  while (bytes.length > 0) bytes = bytes.subarray(await file.write(bytes));
}

function join(directory: string, name: string): string {
  if (/[\\/]$/.test(directory)) return `${directory}${name}`;
  return `${directory}${Deno.build.os === "windows" ? "\\" : "/"}${name}`;
}
