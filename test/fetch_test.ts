// `fetch` with a fake fetch and a temporary folder: the file, `started` and
// `done`, and everything that stops it.
import { deepStrictEqual as eq, equal, rejects } from "node:assert/strict";
import { type FetchEvent, fetchSound, maxSourceBytes } from "../src/fetch.ts";
import type { FetchRequest } from "../src/protocol.ts";
import {
  type Asked,
  audio,
  fakeFetch,
  html,
  instantPage,
  redirect,
} from "./fake.ts";

const sound = "https://www.myinstants.com/media/sounds/vine-boom.mp3";
const sep = Deno.build.os === "windows" ? "\\" : "/";

function request(directory: string, source = sound): FetchRequest {
  return { source, directory, name: "3f2a", trusted: true };
}

function bytes(length: number): Uint8Array {
  return new Uint8Array(length).map((_, i) => i % 251);
}

async function inTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "myinstants-" });
  try {
    await run(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
}

async function names(dir: string): Promise<string[]> {
  const found: string[] = [];
  for await (const entry of Deno.readDir(dir)) found.push(entry.name);
  return found.sort();
}

Deno.test("the sound is written in place between started and done", async () => {
  await inTempDir(async (dir) => {
    const events: FetchEvent[] = [];
    const data = bytes(5000);
    let startedBeforeFile = false;
    await fetchSound(request(dir), (event) => {
      if ("started" in event) {
        startedBeforeFile = true;
        // Before the first byte: the file isn't there yet.
        try {
          Deno.statSync(event.started.path);
          startedBeforeFile = false;
        } catch {
          // Not yet.
        }
      }
      events.push(event);
    }, fakeFetch(() => audio(data)));
    const path = `${dir}${sep}3f2a.mp3`;
    eq(events, [
      { started: { path, size: 5000 } },
      { done: { path } },
    ]);
    equal(startedBeforeFile, true);
    eq(await Deno.readFile(path), data);
  });
});

Deno.test("without a Content-Length, started has no size", async () => {
  await inTempDir(async (dir) => {
    const events: FetchEvent[] = [];
    await fetchSound(
      request(dir),
      (e) => events.push(e),
      fakeFetch(() => audio(bytes(10), "application/octet-stream", null)),
    );
    eq(events[0], { started: { path: `${dir}${sep}3f2a.mp3` } });
  });
});

Deno.test("the extension comes from the link, else the type, else .mp3", async () => {
  await inTempDir(async (dir) => {
    const cases: [string, string | null, string][] = [
      ["https://www.myinstants.com/media/sounds/a.ogg", "audio/ogg", "a.ogg"],
      ["https://www.myinstants.com/media/sounds/b", "audio/wav", "b.wav"],
      ["https://www.myinstants.com/media/sounds/c", null, "c.mp3"],
    ];
    for (const [source, type, file] of cases) {
      const events: FetchEvent[] = [];
      const name = file.split(".")[0];
      await fetchSound(
        { source, directory: dir, name, trusted: true },
        (e) => events.push(e),
        fakeFetch(() => audio(bytes(3), type)),
      );
      eq(events.at(-1), { done: { path: `${dir}${sep}${file}` } });
    }
  });
});

Deno.test("a page link as source is read for its sound first", async () => {
  await inTempDir(async (dir) => {
    const asked: Asked[] = [];
    const events: FetchEvent[] = [];
    await fetchSound(
      request(
        dir,
        "https://www.myinstants.com/en/instant/vine-boom-sound-70972/",
      ),
      (e) => events.push(e),
      fakeFetch(
        (url) =>
          url.pathname.includes("instant")
            ? html(instantPage())
            : audio(bytes(4)),
        asked,
      ),
    );
    eq(asked.map((a) => a.url), [
      "https://www.myinstants.com/en/instant/vine-boom-sound-70972/",
      sound,
    ]);
    equal(events.length, 2);
  });
});

Deno.test("the directory is made when missing", async () => {
  await inTempDir(async (dir) => {
    const nested = `${dir}${sep}sounds${sep}new`;
    await fetchSound(
      request(nested),
      () => {},
      fakeFetch(() => audio(bytes(1))),
    );
    eq(await names(nested), ["3f2a.mp3"]);
  });
});

Deno.test("only MyInstants, trusted or not", async () => {
  await inTempDir(async (dir) => {
    for (
      const source of [
        "https://evil.com/x.mp3",
        "https://myinstants.com.evil.com/media/sounds/x.mp3",
        "http://127.0.0.1/media/sounds/x.mp3",
        "file:///etc/passwd",
      ]
    ) {
      for (const trusted of [true, false]) {
        const asked: Asked[] = [];
        await rejects(
          fetchSound(
            { ...request(dir, source), trusted },
            () => {},
            fakeFetch(() => audio(bytes(1)), asked),
          ),
          /Only myinstants.com links/,
        );
        equal(asked.length, 0);
      }
    }
    // A redirect off the site is refused too.
    await rejects(
      fetchSound(
        request(dir),
        () => {},
        fakeFetch(() => redirect("https://evil.com/x.mp3")),
      ),
      /unsupported site/,
    );
    eq(await names(dir), []);
  });
});

Deno.test("a file over 3 MiB is refused by its Content-Length", async () => {
  await inTempDir(async (dir) => {
    const events: FetchEvent[] = [];
    await rejects(
      fetchSound(
        request(dir),
        (e) => events.push(e),
        fakeFetch(() => audio(bytes(16), "audio/mpeg", maxSourceBytes + 1)),
      ),
      /Audio file too large \(max 3 MB\)/,
    );
    eq(events, []);
    eq(await names(dir), []);
  });
});

Deno.test("a file over 3 MiB is cut off while it downloads", async () => {
  await inTempDir(async (dir) => {
    const events: FetchEvent[] = [];
    await rejects(
      fetchSound(
        request(dir),
        (e) => events.push(e),
        fakeFetch(() => audio(bytes(maxSourceBytes + 1), "audio/mpeg", null)),
      ),
      /Audio file too large \(max 3 MB\)/,
    );
    equal(events.length, 1);
    equal("started" in events[0], true);
    // No half file left behind.
    eq(await names(dir), []);
  });
  await inTempDir(async (dir) => {
    await fetchSound(
      request(dir),
      () => {},
      fakeFetch(() => audio(bytes(maxSourceBytes), "audio/mpeg", null)),
    );
    equal((await Deno.stat(`${dir}${sep}3f2a.mp3`)).size, maxSourceBytes);
  });
});

Deno.test("what isn't audio is refused", async () => {
  await inTempDir(async (dir) => {
    await rejects(
      fetchSound(request(dir), () => {}, fakeFetch(() => html("<html>"))),
      /Not an audio file \(text\/html\)/,
    );
    await rejects(
      fetchSound(
        request(dir),
        () => {},
        fakeFetch(() => audio(new Uint8Array(0))),
      ),
      /empty/,
    );
    await rejects(
      fetchSound(
        request(dir),
        () => {},
        fakeFetch(() => audio(new Uint8Array(0), "audio/mpeg", null)),
      ),
      /empty/,
    );
    eq(await names(dir), []);
  });
});

Deno.test("a download that ends short of its Content-Length failed", async () => {
  await inTempDir(async (dir) => {
    await rejects(
      fetchSound(
        request(dir),
        () => {},
        fakeFetch(() => audio(bytes(10), "audio/mpeg", 20)),
      ),
      /ended early \(10 of 20 bytes\)/,
    );
    eq(await names(dir), []);
  });
});

Deno.test("a failed download says so and leaves nothing", async () => {
  await inTempDir(async (dir) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes(10));
        controller.error(new TypeError("connection reset"));
      },
    });
    await rejects(
      fetchSound(
        request(dir),
        () => {},
        fakeFetch(() =>
          new Response(body, { headers: { "content-type": "audio/mpeg" } })
        ),
      ),
      /connection to www.myinstants.com failed \(connection reset\)/,
    );
    eq(await names(dir), []);
  });
});

Deno.test("refusals are named for the audio", async () => {
  await inTempDir(async (dir) => {
    await rejects(
      fetchSound(request(dir), () => {}, fakeFetch(() => html("no", 403))),
      /refused the audio request \(HTTP 403, bot protection\)/,
    );
  });
});
