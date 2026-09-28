// `resolve` with a fake fetch: a page is read for its sound, a sound file
// is taken as it is, nothing else is asked for.
import { deepStrictEqual as eq, equal, rejects } from "node:assert/strict";
import { resolve } from "../src/resolve.ts";
import { type Asked, fakeFetch, html, instantPage, redirect } from "./fake.ts";

const page = "https://www.myinstants.com/en/instant/vine-boom-sound-70972/";

Deno.test("an instant page resolves to its sound, name and link", async () => {
  const asked: Asked[] = [];
  const tracks = await resolve(
    `[vine boom](${page})`,
    fakeFetch(() => html(instantPage()), asked),
  );
  eq(tracks, [{
    source: "https://www.myinstants.com/media/sounds/vine-boom.mp3",
    title: "VINE BOOM SOUND",
    link: page,
  }]);
  eq(asked.map((a) => a.url), [page]);
});

Deno.test("the link is where the page was, after redirects", async () => {
  const tracks = await resolve(
    "myinstants.com/instant/vine-boom-sound-70972",
    fakeFetch((url) =>
      url.href === page ? html(instantPage()) : redirect(page)
    ),
  );
  equal(tracks[0].link, page);
});

Deno.test("a sound file link resolves without a request", async () => {
  const asked: Asked[] = [];
  const tracks = await resolve(
    "http://myinstants.com/media/sounds/vine-boom.mp3#x",
    fakeFetch(() => html(""), asked),
  );
  eq(tracks, [{
    source: "https://myinstants.com/media/sounds/vine-boom.mp3",
    title: "vine boom",
  }]);
  equal(asked.length, 0);
});

Deno.test("other sites are refused without a request", async () => {
  for (
    const url of [
      "https://evil.com/x",
      "https://myinstants.com.attacker.com/en/instant/x/",
      "file:///etc/passwd",
      "https://user:pw@www.myinstants.com/en/instant/x/",
    ]
  ) {
    const asked: Asked[] = [];
    await rejects(resolve(url, fakeFetch(() => html(""), asked)), Error, url);
    equal(asked.length, 0, url);
  }
});

Deno.test("only an instant's page is read, not lists of them", async () => {
  const asked: Asked[] = [];
  await rejects(
    resolve(
      "https://www.myinstants.com/en/index/us/",
      fakeFetch(() => html(""), asked),
    ),
    /Paste the link of one sound's page/,
  );
  equal(asked.length, 0);
});

Deno.test("a page without a sound is an error", async () => {
  await rejects(
    resolve(page, fakeFetch(() => html("<html>nothing</html>"))),
    /Could not find audio on that MyInstants page/,
  );
});

Deno.test("a sound the page names on another site is not taken", async () => {
  await rejects(
    resolve(
      page,
      fakeFetch(() =>
        html(`<meta property="og:audio" content="https://evil.com/x.mp3">`)
      ),
    ),
    /Could not find audio/,
  );
});

Deno.test("bot protection is named", async () => {
  await rejects(
    resolve(page, fakeFetch(() => html("Attention Required!", 403))),
    /bot protection/,
  );
});
