# MyInstants

A soundboard source extension for the Roscord desktop app. It lets you add
sounds from [MyInstants](https://www.myinstants.com) to a soundboard by
pasting a link to them.

This is an independent project. It is not made, endorsed or supported by the
makers of Roscord, and it is not affiliated with MyInstants.

## Legal note

The sounds on MyInstants are uploaded by its users, and many are clips of
films, shows, games, music and other works that are under copyright. This
extension only downloads the file MyInstants itself offers for download. You
are responsible for what you add to a soundboard and play to others, for
doing so only where you are allowed to, and for following MyInstants' terms.
The software comes with no warranty (see [LICENSE](LICENSE)).

## Installing

Extensions run on desktop Roscord (Linux x64/arm64, Windows x64).

1. Get `myinstants-source-<version>.zip` from this project's releases, or
   copy the link to it.
2. In Roscord, open the soundboard settings, choose to install an extension,
   and pick the file or paste the link.
3. Roscord shows what the extension will download and asks first: Deno (to
   run the extension, about 45 MB), from its official GitHub releases.

To update, install it again from the same file or link.

Then paste a MyInstants link where the soundboard adds a sound:

| Link                                                            | Added as                        |
| --------------------------------------------------------------- | ------------------------------- |
| A sound's page, `https://www.myinstants.com/en/instant/<name>/` | that sound, with its name       |
| A sound file, `https://www.myinstants.com/media/sounds/<f>.mp3` | that file, named after the file |

Links may be pasted bare (`myinstants.com/…`), in angle brackets or as a
Markdown link. Lists of sounds (the home page, searches, categories) are
not taken: open the sound and paste its page.

## How it works

The extension speaks protocol 1 of Roscord's source extensions, and answers
only soundboard requests (`"for": "soundboard"`; the DJ booth gets an error).
Roscord runs `deno run … main.ts <verb> <request-json>` once per request and
reads JSON lines from its stdout.

- `resolve` (`{"url": …}`): reads the sound's page and answers one track:
  `source` is the sound file (`https://www.myinstants.com/media/sounds/….mp3`,
  from the page's `og:audio`, else its play button, else its download link),
  `title` the sound's name and `link` the page. A link to a sound file is
  answered without a request, named after the file.
- `fetch` (`{"source", "directory", "name"}`): downloads the sound file to
  `<directory>/<name>.<ext>` (the extension from the link, `.mp3` if it has
  none), in place. It answers `{"started": {"path", "size"}}` before the
  first byte (`size` only when the server gives the exact length) and
  `{"done": {"path"}}` once the file is complete, or `{"error": …}`. Files
  over 3 MiB, and anything that isn't audio, are refused; a failed download
  leaves no file behind.

Only `myinstants.com` and `www.myinstants.com` are ever asked, over http(s)
on the default port, whatever the request says: the host must match exactly
(`myinstants.com.example.org` doesn't), links with a user name are refused,
and a sound a page names on another site is not taken. Redirects are
followed by hand, at most 3, each only to those hosts. Every request has 15
seconds, its body included. Refusals (HTTP 403 or 429, MyInstants' bot
protection) and missing pages (404) are told apart in the error.

MyInstants is behind Cloudflare, which refuses requests that claim to be a
browser but don't come from one. The extension sends Deno's own User-Agent,
which it lets through.

Deno runs the extension with network access to the two MyInstants hosts
only, and `--allow-write`: the sound goes into a folder Roscord names in each
request, which isn't known when the manifest is written, so writing can't be
limited to it with Deno's flags. It has no `--allow-read`, `--allow-run` or
`--allow-env`, has no dependencies and imports nothing from the network.

## Developing

Needs [Deno](https://deno.com) 2 (or Docker with `denoland/deno`).

```sh
deno task test          # unit tests with a fake fetch, and end-to-end tests (Linux)
deno task test:network  # the same, plus a real resolve and fetch against MyInstants
deno task check         # type check
deno lint
deno fmt --check
deno task package       # dist/myinstants-source-<version>.zip
```

With Docker instead of a local Deno:

```sh
docker run --rm -v "$PWD":/w -w /w denoland/deno:latest deno task test
```

`deno task package` zips `roscord-extension.json`, `main.ts`, `src/`,
`README.md` and `LICENSE` with a small built-in zip writer
(`scripts/package.ts`, no dependencies, fixed timestamps).

Try it by hand, as Roscord would run it:

```sh
deno run --no-prompt --allow-net=www.myinstants.com,myinstants.com \
  --allow-write main.ts resolve \
  '{"protocol": 1, "for": "soundboard", "url": "https://www.myinstants.com/en/instant/vine-boom-sound-70972/"}'
```

To release, set `version` in `roscord-extension.json`, commit, and push a
tag `v<version>`. The workflow in `.github/workflows/release.yml` tests,
packages and attaches the zip (and its SHA-256) to a GitHub release.

## Layout

- `roscord-extension.json`: the manifest (download, hosts, command line).
- `main.ts`: arguments in, JSON lines out.
- `src/protocol.ts`: arguments and requests.
- `src/myinstants.ts`: which links are taken, and reading an instant page.
- `src/http.ts`: requests to MyInstants (redirects, time limit, errors).
- `src/resolve.ts`: `resolve`.
- `src/fetch.ts`: `fetch`.
- `src/process.ts`: exiting when Roscord ends a request, stdout and the log.

## License

[The Unlicense](LICENSE): public domain.
