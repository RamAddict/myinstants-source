// Which links are taken, and what an instant page says.
import { equal, throws } from "node:assert/strict";
import {
  extensionOf,
  extractAudioUrl,
  isAllowedUrl,
  isInstantPage,
  looksLikeAudioFileUrl,
  normalizeUrl,
  requireAllowedUrl,
  titleOf,
  titleOfFile,
} from "../src/myinstants.ts";
import { instantPage } from "./fake.ts";

Deno.test("the allowlist takes the official hosts", () => {
  for (
    const url of [
      "https://www.myinstants.com/en/instant/vine-boom-70972/",
      "https://myinstants.com/media/sounds/vine-boom.mp3",
      "http://www.myinstants.com/en/instant/x/",
      "https://WWW.MyInstants.COM/en/instant/x/",
      "https://www.myinstants.com./en/instant/x/",
      "  https://www.myinstants.com/  ",
    ]
  ) {
    equal(isAllowedUrl(url), true, url);
  }
});

Deno.test("the allowlist rejects lookalikes, other schemes and addresses", () => {
  for (
    const url of [
      "https://myinstants.com.attacker.com/x.mp3",
      "https://www.myinstants.com.evil.org/instant/1/",
      "https://evilmyinstants.com/x.mp3",
      "https://cdn.myinstants.com/x.mp3",
      "https://evil.com/www.myinstants.com/x.mp3",
      "file:///etc/passwd",
      "ftp://www.myinstants.com/x.mp3",
      "javascript:alert(1)",
      "http://localhost:8000/x.mp3",
      "http://127.0.0.1/x.mp3",
      "https://www.myinstants.com:8443/x.mp3",
      "www.myinstants.com/x.mp3",
      "",
      "not a link",
    ]
  ) {
    equal(isAllowedUrl(url), false, url);
  }
});

Deno.test("credentials are refused", () => {
  throws(
    () => requireAllowedUrl("https://user:pass@www.myinstants.com/x"),
    /credentials/,
  );
  throws(
    () => requireAllowedUrl("https://www.myinstants.com@evil.com/x"),
    /Only myinstants.com links/,
  );
  requireAllowedUrl("https://www.myinstants.com/en/instant/x/");
});

Deno.test("normalizeUrl keeps a plain link", () => {
  equal(
    normalizeUrl(" https://www.myinstants.com/pt/instant/faaah-63455/\n"),
    "https://www.myinstants.com/pt/instant/faaah-63455/",
  );
});

Deno.test("normalizeUrl unwraps Markdown links and angle brackets", () => {
  equal(
    normalizeUrl("[www.myinstants.com](http://www.myinstants.com)"),
    "http://www.myinstants.com",
  );
  equal(
    normalizeUrl("<https://www.myinstants.com/pt/instant/faaah-63455/>"),
    "https://www.myinstants.com/pt/instant/faaah-63455/",
  );
  equal(
    normalizeUrl("[ok]( https://www.myinstants.com/en/instant/ok-1/ )"),
    "https://www.myinstants.com/en/instant/ok-1/",
  );
});

Deno.test("normalizeUrl adds https to a bare address and drops the fragment", () => {
  equal(
    normalizeUrl("www.myinstants.com/pt/instant/faaah-63455/#top"),
    "https://www.myinstants.com/pt/instant/faaah-63455/",
  );
  equal(
    normalizeUrl("MyInstants.com/media/sounds/faaah.mp3"),
    "https://MyInstants.com/media/sounds/faaah.mp3",
  );
  equal(normalizeUrl("myinstants.com"), "https://myinstants.com");
});

Deno.test("normalizeUrl leaves other sites for the allowlist to reject", () => {
  for (
    const input of [
      "myinstants.com.evil.org/x.mp3",
      "[myinstants](https://evil.org/myinstants.com)",
      "<https://evil.org/#https://www.myinstants.com/>",
    ]
  ) {
    equal(isAllowedUrl(normalizeUrl(input)), false, input);
  }
});

Deno.test("instant pages and sound files are told apart by their path", () => {
  for (
    const url of [
      "https://www.myinstants.com/en/instant/vine-boom-sound-70972/",
      "https://www.myinstants.com/pt/instant/faaah-63455",
      "https://www.myinstants.com/instant/vine-boom-sound-70972/",
      "https://www.myinstants.com/pt-br/instant/x/",
    ]
  ) {
    equal(isInstantPage(url), true, url);
    equal(looksLikeAudioFileUrl(url), false, url);
  }
  for (
    const url of [
      "https://www.myinstants.com/en/index/us/",
      "https://www.myinstants.com/",
      "https://www.myinstants.com/en/search/?name=boom",
      "https://www.myinstants.com/en/instant/",
    ]
  ) {
    equal(isInstantPage(url), false, url);
  }
  equal(
    looksLikeAudioFileUrl("https://www.myinstants.com/media/sounds/x.MP3?v=2"),
    true,
  );
  equal(
    extensionOf("https://www.myinstants.com/media/sounds/x.ogg"),
    ".ogg",
  );
  equal(extensionOf("https://www.myinstants.com/media/sounds/x"), undefined);
  equal(
    looksLikeAudioFileUrl("https://www.myinstants.com/media/sounds/x"),
    true,
  );
  equal(looksLikeAudioFileUrl("https://www.myinstants.com/media/x"), false);
});

const pageUrl = "https://www.myinstants.com/pt/instant/faaah-63455/";

Deno.test("extractAudioUrl reads the live instant page markup", () => {
  // Trimmed from https://www.myinstants.com/pt/instant/faaah-63455/.
  const markup =
    `<meta property="og:audio" content="https://www.myinstants.com/media/sounds/faaah.mp3"/>
<meta property="og:audio:type" content="audio/mpeg" />
<button onclick="play('/media/sounds/faaah.mp3', 'loader-', 'faaah-63455')"></button>
<a href="/media/sounds/faaah.mp3" download target="_blank" class="instant-page-extra-button btn btn-primary">`;
  equal(
    extractAudioUrl(markup, pageUrl),
    "https://www.myinstants.com/media/sounds/faaah.mp3",
  );
  equal(
    extractAudioUrl(instantPage(), pageUrl),
    "https://www.myinstants.com/media/sounds/vine-boom.mp3",
  );
});

Deno.test("extractAudioUrl reads og:audio with its attributes reversed", () => {
  equal(
    extractAudioUrl(
      `<meta content='/media/sounds/rev.mp3' name='og:audio'>`,
      pageUrl,
    ),
    "https://www.myinstants.com/media/sounds/rev.mp3",
  );
});

Deno.test("extractAudioUrl falls back to a download link", () => {
  const markup = `<a href="/pt/instant/faaah-63455/">faaah</a>
<a href="/media/sounds/faaah.mp3" download target="_blank">download</a>`;
  equal(
    extractAudioUrl(markup, pageUrl),
    "https://www.myinstants.com/media/sounds/faaah.mp3",
  );
  equal(
    extractAudioUrl(
      `<a download="x.mp3" class="b" href="/media/sounds/x.mp3">`,
      pageUrl,
    ),
    "https://www.myinstants.com/media/sounds/x.mp3",
  );
  // A link without `download` is not the sound.
  equal(extractAudioUrl(`<a href="/media/sounds/x.mp3">`, pageUrl), null);
});

Deno.test("extractAudioUrl prefers og:audio", () => {
  const markup = `<html><head>
<meta property="og:audio" content="https://www.myinstants.com/media/sounds/vine-boom.mp3" />
<script>play('/media/sounds/other.mp3')</script>
</head></html>`;
  equal(
    extractAudioUrl(markup, pageUrl),
    "https://www.myinstants.com/media/sounds/vine-boom.mp3",
  );
});

Deno.test("extractAudioUrl falls back to the play() hook", () => {
  const markup = `<div class="instant">
<a class="small-button" onmousedown="play('/media/sounds/bruh.mp3')">play</a>
</div>`;
  equal(
    extractAudioUrl(markup, pageUrl),
    "https://www.myinstants.com/media/sounds/bruh.mp3",
  );
});

Deno.test("extractAudioUrl never returns another site's links", () => {
  const markup =
    `<meta property="og:audio" content="https://evil.com/steal.mp3" />
<script>play('/media/sounds/ok.mp3')</script>`;
  equal(
    extractAudioUrl(markup, pageUrl),
    "https://www.myinstants.com/media/sounds/ok.mp3",
  );
  for (
    const bad of [
      `<meta property="og:audio" content="https://myinstants.com.evil.org/media/sounds/x.mp3">`,
      `<meta property="og:audio" content="//evil.com/media/sounds/x.mp3">`,
      `<meta property="og:audio" content="https://u:p@www.myinstants.com/media/sounds/x.mp3">`,
      `<a href="https://evil.com/media/sounds/x.mp3" download>`,
      `<meta property="og:audio" content="https://www.myinstants.com/en/instant/x/">`,
    ]
  ) {
    equal(extractAudioUrl(bad, pageUrl), null, bad);
  }
});

Deno.test("extractAudioUrl makes the link https on the default port", () => {
  equal(
    extractAudioUrl(
      `<meta property="og:audio" content="http://www.myinstants.com:80/media/sounds/a.mp3?x=1&amp;y=2">`,
      pageUrl,
    ),
    "https://www.myinstants.com/media/sounds/a.mp3?x=1&y=2",
  );
});

Deno.test("extractAudioUrl finds nothing in a page without a sound", () => {
  equal(extractAudioUrl("<html></html>", pageUrl), null);
});

Deno.test("the title is the instant's name", () => {
  equal(titleOf(instantPage(), pageUrl), "VINE BOOM SOUND");
  equal(
    titleOf(instantPage({ name: "Don&#39;t &amp; &quot;stop&quot;" }), pageUrl),
    `Don't & "stop"`,
  );
  // Without the heading: og:title, then <title>, in any language.
  equal(
    titleOf(
      `<meta property="og:title" content="FAAAH - Botão sonoro"/>`,
      pageUrl,
    ),
    "FAAAH",
  );
  equal(
    titleOf(
      `<meta property="og:title" content="A - B - Sound-Taste"/>`,
      pageUrl,
    ),
    "A - B",
  );
  equal(
    titleOf(
      `<title>VINE BOOM SOUND - Instant Sound Effect Button | Myinstants</title>`,
      pageUrl,
    ),
    "VINE BOOM SOUND",
  );
  equal(
    titleOf(
      `<title>VINE BOOM SOUND: botón de efectos de sonido instantáneos | Myinstants</title>`,
      pageUrl,
    ),
    "VINE BOOM SOUND",
  );
  // Nothing on the page: the link's slug.
  equal(
    titleOf(
      "<html></html>",
      "https://www.myinstants.com/en/instant/vine-boom-sound-70972/",
    ),
    "vine boom sound",
  );
  equal(titleOf("", "https://www.myinstants.com/"), "MyInstants sound");
});

Deno.test("a sound file's title is its name", () => {
  equal(
    titleOfFile("https://www.myinstants.com/media/sounds/vine-boom.mp3"),
    "vine boom",
  );
  equal(
    titleOfFile(
      "https://www.myinstants.com/media/sounds/caf%C3%A9_au_lait.ogg",
    ),
    "café au lait",
  );
  equal(
    titleOfFile("https://www.myinstants.com/media/sounds/.mp3"),
    "MyInstants sound",
  );
});
