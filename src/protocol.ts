// Protocol 1 of Roscord's source extensions: the app runs
// `<command> <args…> <verb> <request>`, where the request is one JSON object
// as a single argument, and reads JSON objects from our stdout, one per
// line. stdin is empty. Every request carries `"protocol": 1` and `"data"`,
// a folder we may keep things in, and `"for"`: what the answer is for
// (`"dj"`, the booth, when missing). This extension only adds soundboard
// sounds.

export const protocolVersion = 1;
export type Verb = "resolve" | "fetch";

export interface Invocation {
  verb: Verb;
  /** The request, parsed but not yet checked against the verb. */
  request: unknown;
}

export class UsageError extends Error {}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The request is the last argument and the verb the one before it; the
 * manifest's own arguments come first.
 */
export function parseArgs(args: string[]): Invocation {
  const last = args.at(-1);
  if (args.length < 2 || last === "resolve" || last === "fetch") {
    throw new UsageError("Expected a verb and a request as the last arguments");
  }
  const verb = args[args.length - 2];
  if (verb !== "resolve" && verb !== "fetch") {
    throw new UsageError(`Unknown verb: ${verb}`);
  }
  let request: unknown;
  try {
    request = JSON.parse(args[args.length - 1]);
  } catch {
    throw new UsageError("The request is not JSON");
  }
  // Anything before the verb is left for later versions of the manifest.
  return { verb, request };
}

interface Common {
  /** A folder the extension may keep things in, when the app gave one. */
  data?: string;
}

export interface ResolveRequest extends Common {
  url: string;
}

export interface FetchRequest extends Common {
  source: string;
  directory: string;
  name: string;
  trusted: boolean;
}

function common(json: unknown): Record<string, unknown> & Common {
  if (!isObject(json)) throw new UsageError("The request is not an object");
  if (json["protocol"] !== protocolVersion) {
    throw new UsageError(
      `Protocol ${JSON.stringify(json["protocol"])} is not supported, ` +
        `this extension speaks ${protocolVersion}`,
    );
  }
  // Not said is the DJ booth, which predates the soundboard.
  const use = json["for"] ?? "dj";
  if (use !== "soundboard") {
    const what = use === "dj" ? "the DJ booth" : JSON.stringify(use);
    throw new UsageError(
      `This extension adds MyInstants sounds to the soundboard, not to ${what}`,
    );
  }
  const data = json["data"];
  return {
    ...json,
    data: typeof data === "string" && data !== "" ? data : undefined,
  };
}

export function parseResolveRequest(json: unknown): ResolveRequest {
  const request = common(json);
  if (typeof request["url"] !== "string") {
    throw new UsageError("The request has no url");
  }
  return { url: request["url"], data: request.data };
}

export function parseFetchRequest(json: unknown): FetchRequest {
  const request = common(json);
  const { source, directory, name, trusted, data } = request;
  if (typeof source !== "string" || source === "") {
    throw new UsageError("The request has no source");
  }
  if (typeof directory !== "string" || directory === "") {
    throw new UsageError("The request has no directory");
  }
  // The name is a file name in the directory, never a path out of it.
  if (
    typeof name !== "string" || name === "" || /[\\/]/.test(name) ||
    name === "." || name === ".."
  ) {
    throw new UsageError("The request's name is not a file name");
  }
  // Not said is not trusted. The soundboard always trusts its sources, and
  // fetch checks them against the MyInstants hosts either way.
  return { source, directory, name, trusted: trusted === true, data };
}
