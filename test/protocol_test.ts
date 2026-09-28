// Arguments and requests, and that only the soundboard is answered.
import { deepStrictEqual as eq, equal, throws } from "node:assert/strict";
import {
  parseArgs,
  parseFetchRequest,
  parseResolveRequest,
} from "../src/protocol.ts";

Deno.test("the verb and the request come last, the manifest's arguments first", () => {
  eq(parseArgs(["resolve", '{"protocol":1,"url":"u"}']), {
    verb: "resolve",
    request: { protocol: 1, url: "u" },
  });
  eq(parseArgs(["--later-option", "x", "fetch", "{}"]), {
    verb: "fetch",
    request: {},
  });
  throws(() => parseArgs([]), /verb and a request/);
  throws(() => parseArgs(["resolve"]), /verb and a request/);
  throws(() => parseArgs(["x", "resolve"]), /verb and a request/);
  throws(() => parseArgs(["play", "{}"]), /Unknown verb: play/);
  throws(() => parseArgs(["resolve", "{nope"]), /not JSON/);
});

const soundboard = { protocol: 1, for: "soundboard" };

Deno.test("requests speak protocol 1", () => {
  eq(parseResolveRequest({ ...soundboard, data: "/d", url: "https://a.b" }), {
    url: "https://a.b",
    data: "/d",
  });
  eq(parseResolveRequest({ ...soundboard, data: "", url: "u" }), {
    url: "u",
    data: undefined,
  });
  throws(
    () => parseResolveRequest({ ...soundboard, protocol: 2, url: "x" }),
    /Protocol 2 is not supported/,
  );
  throws(
    () => parseResolveRequest({ for: "soundboard", url: "x" }),
    /Protocol undefined/,
  );
  throws(() => parseResolveRequest(soundboard), /no url/);
  throws(() => parseResolveRequest([1]), /not an object/);
});

Deno.test("only soundboard requests are answered", () => {
  // No `for` is the DJ booth, which predates the soundboard.
  for (
    const request of [
      { protocol: 1, url: "https://www.myinstants.com/" },
      { protocol: 1, for: "dj", url: "https://www.myinstants.com/" },
    ]
  ) {
    throws(
      () => parseResolveRequest(request),
      /soundboard, not to the DJ booth/,
    );
  }
  throws(
    () => parseResolveRequest({ protocol: 1, for: "radio", url: "u" }),
    /not to "radio"/,
  );
  throws(
    () => parseResolveRequest({ protocol: 1, for: 3, url: "u" }),
    /not to 3/,
  );
  throws(
    () =>
      parseFetchRequest({
        protocol: 1,
        for: "dj",
        source: "s",
        directory: "/d",
        name: "n",
      }),
    /soundboard/,
  );
});

Deno.test("fetch requests: a file name, and trust only when said", () => {
  const base = {
    ...soundboard,
    data: "/d",
    source: "https://www.myinstants.com/media/sounds/x.mp3",
    directory: "/sounds",
  };
  eq(parseFetchRequest({ ...base, name: "3f2a", trusted: true }), {
    source: "https://www.myinstants.com/media/sounds/x.mp3",
    directory: "/sounds",
    name: "3f2a",
    trusted: true,
    data: "/d",
  });
  equal(parseFetchRequest({ ...base, name: "3f2a" }).trusted, false);
  equal(
    parseFetchRequest({ ...base, name: "3f2a", trusted: "yes" }).trusted,
    false,
  );
  for (const name of ["../x", "a/b", "a\\b", "..", ".", "", 5]) {
    throws(
      () => parseFetchRequest({ ...base, name }),
      /not a file name/,
      String(name),
    );
  }
  throws(
    () => parseFetchRequest({ ...base, name: "n", source: "" }),
    /no source/,
  );
  throws(
    () => parseFetchRequest({ ...base, name: "n", directory: 1 }),
    /no directory/,
  );
});
