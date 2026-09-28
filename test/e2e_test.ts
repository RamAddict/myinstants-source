// The extension end to end, as the app runs it: the manifest's command line
// (its permissions included) with the verb and request appended. Linux only,
// where the paths are simple. The tests against the real MyInstants run only
// with MYINSTANTS_NETWORK=1 (`deno task test:network`).
import { deepStrictEqual as eq, equal, match, ok } from "node:assert/strict";

// A path only on Linux, where these run; the manifest is read by URL, as
// this module loads everywhere.
const root = new URL("../", import.meta.url).pathname;
const manifest = JSON.parse(
  Deno.readTextFileSync(new URL("../roscord-extension.json", import.meta.url)),
);
const linux = Deno.build.os === "linux";
const network = linux && Deno.env.get("MYINSTANTS_NETWORK") === "1";

interface Run {
  code: number;
  answers: Record<string, unknown>[];
  stderr: string;
}

async function run(verb: string, request: unknown): Promise<Run> {
  const args = (manifest.run.args as string[]).map((a) =>
    a.replace("{dir}", root.replace(/\/$/, ""))
  );
  const output = await new Deno.Command(Deno.execPath(), {
    args: [...args, verb, JSON.stringify(request)],
    cwd: root,
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdout = new TextDecoder().decode(output.stdout);
  return {
    code: output.code,
    answers: stdout.split("\n").filter((l) => l !== "").map((l) =>
      JSON.parse(l)
    ),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

Deno.test({
  name: "the manifest asks for Deno only, and no programs or reading",
  fn() {
    eq(manifest.uses, ["soundboard"]);
    eq(manifest.downloads.map((d: { id: string }) => d.id), ["deno"]);
    equal(manifest.run.command, "{dep:deno}");
    const args = manifest.run.args as string[];
    ok(args.includes("--allow-net=www.myinstants.com,myinstants.com"));
    for (const flag of ["--allow-run", "--allow-read", "--allow-all", "-A"]) {
      ok(!args.some((a) => a === flag || a.startsWith(`${flag}=`)), flag);
    }
    match(manifest.id, /^[a-z0-9._-]{3,64}$/);
  },
});

Deno.test({
  name: "the DJ booth gets an error",
  ignore: !linux,
  async fn() {
    for (const request of [{ protocol: 1 }, { protocol: 1, for: "dj" }]) {
      const result = await run("resolve", {
        ...request,
        url: "https://www.myinstants.com/en/instant/vine-boom-sound-70972/",
      });
      equal(result.code, 1);
      equal(result.answers.length, 1);
      match(String(result.answers[0].error), /soundboard, not to the DJ booth/);
    }
  },
});

Deno.test({
  name: "other sites get an error without a request",
  ignore: !linux,
  async fn() {
    const result = await run("resolve", {
      protocol: 1,
      for: "soundboard",
      url: "https://evil.com/x.mp3",
    });
    equal(result.code, 1);
    eq(result.answers, [{ error: "Only myinstants.com links are supported" }]);
  },
});

Deno.test({
  name: "bad arguments get an error",
  ignore: !linux,
  async fn() {
    const result = await run("play", {});
    equal(result.code, 2);
    eq(result.answers, [{ error: "Unknown verb: play" }]);
  },
});

Deno.test({
  name: "network: a real instant page resolves and downloads",
  ignore: !network,
  async fn() {
    const page = "https://www.myinstants.com/en/instant/vine-boom-sound-70972/";
    const resolved = await run("resolve", {
      protocol: 1,
      for: "soundboard",
      url: page,
    });
    equal(resolved.code, 0, resolved.stderr);
    eq(resolved.answers, [{
      tracks: [{
        source: "https://www.myinstants.com/media/sounds/vine-boom.mp3",
        title: "VINE BOOM SOUND",
        link: page,
      }],
    }]);

    const directory = await Deno.makeTempDir({ prefix: "myinstants-e2e-" });
    try {
      const fetched = await run("fetch", {
        protocol: 1,
        for: "soundboard",
        source: "https://www.myinstants.com/media/sounds/vine-boom.mp3",
        directory,
        name: "vine",
        trusted: true,
      });
      equal(fetched.code, 0, fetched.stderr);
      const path = `${directory}/vine.mp3`;
      equal(fetched.answers.length, 2, JSON.stringify(fetched.answers));
      const started = fetched.answers[0].started as Record<string, unknown>;
      equal(started.path, path);
      eq(fetched.answers[1], { done: { path } });
      const bytes = await Deno.readFile(path);
      if (started.size !== undefined) equal(bytes.length, started.size);
      // An MP3: an ID3 tag or a frame sync.
      ok(
        (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
          (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0),
      );
    } finally {
      await Deno.remove(directory, { recursive: true });
    }
  },
});
