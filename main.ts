// MyInstants: a soundboard source extension for Roscord (protocol 1). See
// README.md.
//
// Run as `deno run … main.ts <verb> <request-json>`: the manifest gives
// everything up to the script, the app appends the verb and the request.
// Answers are JSON objects on stdout, one per line; the log goes to stderr,
// which the app keeps.
import { fetchSound } from "./src/fetch.ts";
import { installExitHandlers, shutdown, writeAllSync } from "./src/process.ts";
import {
  parseArgs,
  parseFetchRequest,
  parseResolveRequest,
} from "./src/protocol.ts";
import { resolve } from "./src/resolve.ts";

function answer(value: unknown): void {
  writeAllSync(Deno.stdout, `${JSON.stringify(value)}\n`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<number> {
  installExitHandlers();
  let invocation;
  try {
    invocation = parseArgs(Deno.args);
  } catch (e) {
    answer({ error: messageOf(e) });
    return 2;
  }
  try {
    if (invocation.verb === "resolve") {
      const request = parseResolveRequest(invocation.request);
      answer({ tracks: await resolve(request.url) });
    } else {
      const request = parseFetchRequest(invocation.request);
      await fetchSound(request, answer);
    }
    return 0;
  } catch (e) {
    answer({ error: messageOf(e) });
    return 1;
  }
}

if (import.meta.main) shutdown(await main());
