// A stand-in for `fetch` that answers from a function and remembers what was
// asked, so no test needs the network.
import type { Fetcher } from "../src/http.ts";

export interface Asked {
  url: string;
  init?: RequestInit;
}

export function fakeFetch(
  answer: (url: URL) => Response | Promise<Response>,
  asked: Asked[] = [],
): Fetcher {
  return ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    asked.push({ url: url.href, init });
    return Promise.resolve(answer(url));
  }) as Fetcher;
}

export function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export function redirect(location: string, status = 301): Response {
  return new Response(null, { status, headers: { location } });
}

/** An audio answer; `length` is sent as Content-Length unless null. */
export function audio(
  bytes: Uint8Array,
  type: string | null = "audio/mpeg",
  length: number | null = bytes.length,
): Response {
  const headers: Record<string, string> = {};
  if (type !== null) headers["content-type"] = type;
  if (length !== null) headers["content-length"] = String(length);
  return new Response(new Blob([bytes as BlobPart]).stream(), { headers });
}

/** The instant page markup that matters, trimmed from the live site. */
export function instantPage(
  {
    name = "VINE BOOM SOUND",
    sound = "vine-boom.mp3",
    slug = "vine-boom-sound-70972",
  } = {},
): string {
  return `<!DOCTYPE html><html lang="en"><head>
<title>${name} - Instant Sound Effect Button | Myinstants</title>
<meta property="og:title" content="${name} - Sound Button"/>
<meta property="og:url" content="https://www.myinstants.com/en/instant/${slug}/"/>
<meta property="og:audio" content="https://www.myinstants.com/media/sounds/${sound}"/>
<meta property="og:audio:type" content="audio/mpeg" />
<meta property="og:image" content="https://www.myinstants.com/media/images/myinstants-opengraph-v4.jpg"/>
</head><body>
<h1 id="instant-page-title">${name}</h1>
<button class="small-button" onclick="play('/media/sounds/${sound}', 'loader-', '${slug}')"></button>
<a href="/media/sounds/${sound}" download target="_blank" class="instant-page-extra-button btn btn-primary">Download MP3</a>
</body></html>`;
}
