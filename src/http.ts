// Requests to MyInstants: a plain GET that follows at most `maxRedirects`
// redirects by hand, each to a MyInstants host, with `timeoutMs` for the
// whole request (body included), and failures told in words a user can act
// on.
//
// MyInstants sits behind Cloudflare, which answers 403 to requests whose
// User-Agent claims to be a browser from a TLS stack that isn't one. Deno's
// own User-Agent (`Deno/<version>`) gets 200, so no browser headers here.
import { isAllowedUrl, MyInstantsError } from "./myinstants.ts";
import { log } from "./process.ts";

export type Fetcher = typeof fetch;

export const maxRedirects = 3;
export const timeoutMs = 15_000;

/** A request to MyInstants failed or was refused (not the link's fault). */
export class RequestError extends MyInstantsError {}

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

export interface Got {
  response: Response;
  /** Where the response came from, after redirects. */
  url: string;
}

/**
 * GETs `url` (on a MyInstants host), following redirects that stay on
 * MyInstants. `what` names it in errors ("page", "audio"). The response is
 * a 2xx one; its body is left to read, within the same time limit.
 */
export async function get(
  url: string,
  what: string,
  fetcher: Fetcher = fetch,
): Promise<Got> {
  let current = new URL(url);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let redirects = 0;; redirects++) {
    log(`GET ${current.href}`);
    let response: Response;
    try {
      response = await fetcher(current, { redirect: "manual", signal });
    } catch (e) {
      throw failure(e, current.hostname);
    }
    log(`-> ${describe(response)}`);
    const location = response.headers.get("location");
    if (!redirectStatuses.has(response.status) || location === null) {
      await checkStatus(response, what);
      return { response, url: current.href };
    }
    await response.body?.cancel();
    if (redirects === maxRedirects) {
      throw new RequestError("MyInstants redirected too many times");
    }
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      throw new RequestError("MyInstants redirected to an invalid link");
    }
    if (
      !isAllowedUrl(next.href) || next.username !== "" || next.password !== ""
    ) {
      throw new RequestError(
        `MyInstants redirected to an unsupported site (${next.hostname})`,
      );
    }
    current = next;
  }
}

async function checkStatus(response: Response, what: string): Promise<void> {
  const code = response.status;
  if (code >= 200 && code < 300) return;
  await response.body?.cancel();
  if (code === 403 || code === 429) {
    throw new RequestError(
      `MyInstants refused the ${what} request (HTTP ${code}, bot protection)`,
    );
  }
  if (code === 404) {
    throw new RequestError(
      `MyInstants ${what} not found (HTTP 404). Check the link.`,
    );
  }
  throw new RequestError(`MyInstants ${what} request failed (HTTP ${code})`);
}

function describe(response: Response): string {
  const headers = response.headers;
  return [
    String(response.status),
    headers.get("content-type"),
    headers.has("content-length") && `${headers.get("content-length")} bytes`,
    response.status >= 300 && headers.has("server") &&
    `server=${headers.get("server")}`,
    response.status >= 300 && headers.has("cf-ray") &&
    `cf-ray=${headers.get("cf-ray")}`,
    headers.has("cf-mitigated") &&
    `cf-mitigated=${headers.get("cf-mitigated")}`,
  ].filter((part) => typeof part === "string").join(", ");
}

/**
 * A network failure (while connecting or reading) as a message a user can
 * act on. Our own errors pass through.
 */
export function failure(error: unknown, host: string): Error {
  if (error instanceof MyInstantsError) return error;
  log(`-> failed: ${error}`);
  if (
    error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  ) {
    return new RequestError(
      `${host} did not answer in time. ` +
        "Check your internet connection and try again.",
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new RequestError(
    `The connection to ${host} failed (${message}). ` +
      "Check your internet connection and try again.",
  );
}

/** A response's body as text, at most `maxBytes` of it. */
export async function readText(
  response: Response,
  maxBytes: number,
  host: string,
): Promise<string> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for await (const chunk of response.body ?? []) {
      length += chunk.length;
      // Leaving the loop cancels the rest of the body.
      if (length > maxBytes) {
        throw new RequestError("The MyInstants page is too large");
      }
      chunks.push(chunk);
    }
  } catch (e) {
    throw failure(e, host);
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return new TextDecoder().decode(bytes);
}
