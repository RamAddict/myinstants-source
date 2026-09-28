// Exiting when asked, and writing to stdout and stderr.
//
// The app kills a request that runs over its time: on Linux with SIGTERM
// (Dart's Process.kill), on Windows by ending the job object it runs us in,
// which can't be caught. We start no programs of our own, so all there is to
// do is stop at once rather than go on writing a sound nobody waits for.
// Ctrl+C/Ctrl+Break are handled for when the extension is run by hand.

let installed = false;

/** Exits with `code`. */
export function shutdown(code: number): never {
  Deno.exit(code);
}

/** Wires signal handling and the parent poll up, once. */
export function installExitHandlers(): void {
  if (installed) return;
  installed = true;
  const signals: Deno.Signal[] = Deno.build.os === "windows"
    ? ["SIGINT", "SIGBREAK"]
    : ["SIGTERM", "SIGINT", "SIGHUP"];
  for (const signal of signals) {
    try {
      Deno.addSignalListener(signal, () => shutdown(143));
    } catch {
      // Not supported here.
    }
  }
  if (Deno.build.os !== "windows") {
    // Re-parented to init or a subreaper: whoever asked is gone.
    const parent = Deno.ppid;
    const timer = setInterval(() => {
      if (Deno.ppid !== parent) shutdown(143);
    }, 1000);
    Deno.unrefTimer(timer);
  }
}

const encoder = new TextEncoder();

/** Writes all of `text`, synchronously: nothing is lost if we exit next. */
export function writeAllSync(
  out: { writeSync(p: Uint8Array): number },
  text: string,
): void {
  let bytes = encoder.encode(text);
  while (bytes.length > 0) bytes = bytes.subarray(out.writeSync(bytes));
}

/** A line for the app's log, which keeps our stderr. */
export function log(message: string): void {
  try {
    writeAllSync(Deno.stderr, `${message}\n`);
  } catch {
    // Nobody reading.
  }
}
