// Redirects, refusals and network failures, with a fake fetch.
import { equal, ok, rejects } from "node:assert/strict";
import { failure, get, maxRedirects, RequestError } from "../src/http.ts";
import { type Asked, fakeFetch, html, redirect } from "./fake.ts";

const page = "https://www.myinstants.com/en/instant/vine-boom-sound-70972/";

Deno.test("redirects are followed by hand, on MyInstants", async () => {
  const asked: Asked[] = [];
  const fetcher = fakeFetch((url) => {
    if (url.hostname === "myinstants.com") {
      return redirect(`https://www.myinstants.com${url.pathname}`);
    }
    if (!url.pathname.endsWith("/")) return redirect(`${url.pathname}/`, 302);
    return html("ok");
  }, asked);
  const got = await get(
    "http://myinstants.com/en/instant/vine-boom-sound-70972",
    "page",
    fetcher,
  );
  equal(got.url, page);
  equal(await got.response.text(), "ok");
  equal(asked.length, 3);
  for (const { init } of asked) {
    equal(init?.redirect, "manual");
    ok(init?.signal instanceof AbortSignal);
    // Deno's own User-Agent: Cloudflare refuses a browser's from Deno.
    equal(init?.headers, undefined);
  }
});

Deno.test(`at most ${maxRedirects} redirects`, async () => {
  let hops = 0;
  const loop = fakeFetch(() => redirect(`/en/instant/x-${++hops}/`));
  await rejects(get(page, "page", loop), /redirected too many times/);
  equal(hops, maxRedirects + 1);

  hops = 0;
  const three = fakeFetch(() =>
    hops < maxRedirects ? redirect(`/en/instant/x-${++hops}/`) : html("ok")
  );
  equal(
    (await get(page, "page", three)).url,
    `https://www.myinstants.com/en/instant/x-${maxRedirects}/`,
  );
});

Deno.test("a redirect off MyInstants is refused before it is followed", async () => {
  for (
    const location of [
      "https://evil.com/x.mp3",
      "https://myinstants.com.evil.com/x.mp3",
      "http://127.0.0.1/x.mp3",
      "https://www.myinstants.com:8443/x.mp3",
      "https://user:pw@www.myinstants.com/x.mp3",
      "file:///etc/passwd",
    ]
  ) {
    const asked: Asked[] = [];
    await rejects(
      get(page, "page", fakeFetch(() => redirect(location), asked)),
      RequestError,
      location,
    );
    equal(asked.length, 1, location);
  }
  await rejects(
    get(page, "page", fakeFetch(() => redirect("https://evil.com/"))),
    /redirected to an unsupported site \(evil\.com\)/,
  );
});

Deno.test("refusals and missing pages are told apart", async () => {
  for (const status of [403, 429]) {
    await rejects(
      get(page, "page", fakeFetch(() => html("blocked", status))),
      new RegExp(
        `refused the page request \\(HTTP ${status}, bot protection\\)`,
      ),
    );
  }
  await rejects(
    get(page, "audio", fakeFetch(() => html("gone", 404))),
    /MyInstants audio not found \(HTTP 404\)\. Check the link\./,
  );
  await rejects(
    get(page, "page", fakeFetch(() => html("oops", 500))),
    /MyInstants page request failed \(HTTP 500\)/,
  );
  // A redirect without a location is an answer like any other.
  await rejects(
    get(page, "page", fakeFetch(() => new Response(null, { status: 302 }))),
    /HTTP 302/,
  );
});

Deno.test("network failures say to check the connection", async () => {
  await rejects(
    get(
      page,
      "page",
      fakeFetch(() => {
        throw new TypeError(
          "error sending request for url: dns error: failed to lookup address",
        );
      }),
    ),
    (e: Error) =>
      e instanceof RequestError &&
      e.message.includes("The connection to www.myinstants.com failed") &&
      e.message.includes("dns error") &&
      e.message.includes("internet connection"),
  );
  const timeout = failure(
    new DOMException("Signal timed out.", "TimeoutError"),
    "www.myinstants.com",
  );
  equal(
    timeout.message,
    "www.myinstants.com did not answer in time. " +
      "Check your internet connection and try again.",
  );
  const own = new RequestError("mine");
  equal(failure(own, "h"), own);
});
