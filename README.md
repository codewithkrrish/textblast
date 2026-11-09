# TextBlast

I built TextBlast because every text repeater I found was either plastered with ads, capped at some tiny count like 100, or made me wonder where my text was going. This one repeats your text up to 100,000 times, right in the browser, and the page never sees a server at all. Type something, pick a count, and copy the result — that is the whole deal.

## How it works

1. Type or paste the text you want repeated. The character and word counts update as you type.
2. Pick a repeat count — drag the slider, type a number, or tap a preset (10, 100, 1,000, 10,000, 100,000).
3. Choose a separator: space, new line, comma, a custom one of your own, or none at all. Add numbering (1. / 1) / [1]) and an optional prefix or suffix on every repeat.
4. The output preview and the result stats — characters, words, lines, estimated size — update live. Copy the full output with one tap, or download it as a .txt file.

Your settings (count, separator, numbering, prefix, suffix) are remembered in your browser, so the page opens the way you left it. Your text is never saved.

## The honest limitations

- **The preview only shows the first 2,000 characters.** A 100,000-repeat job can be millions of characters long, and rendering all of that would freeze the tab. Copy and Download always use the complete output — the preview limit is only about what gets drawn on screen. A "Show full output" button is there if you really want to see it all.
- **Very large outputs can be slow to copy.** A few megabytes of text takes a couple of seconds to reach the clipboard, and some apps paste huge text slowly. For anything over ~5 MB, downloading the .txt file is the reliable route — the page says so before you try.
- **The count is clamped to 1–100,000.** Typing 0, a negative number or 999,999 snaps back into range instead of throwing an error. If you genuinely need more than 100,000 repeats, this tool is not the one — your browser would struggle with the result anyway.
- **Word counts are simple.** Words are whitespace-separated tokens, so "hello-world" counts as one word and a numbering label like "[42]" counts as one word too. Good enough for sizing an output, not a linguistics tool.
- **Your text is not saved anywhere.** That includes this browser — reload the page and the text box is empty again. Only the settings persist, on purpose.

## Running it locally

No build step, no dependencies to install. Serve the folder over HTTP (ES modules need a real origin, `file://` will not do) and open `index.html`:

```sh
python3 -m http.server 8000
```

Then visit http://localhost:8000.

## Technical notes

- `js/engine.js` — the pure logic: count clamping, separator resolution, numbering formats, output assembly, exact size estimation (characters, UTF-8 bytes, words, lines) computed without building the string, and a bounded preview builder so huge jobs never freeze the page. No DOM, no clipboard, fully unit-tested.
- `js/main.js` — the DOM wiring: live stats and preview, slider + number input sync, presets, separator/numbering/prefix/suffix controls, settings persistence in localStorage, copy (Clipboard API with a textarea fallback) and .txt download.
- The live result stats come from the estimator, not from a built string — that is what keeps typing responsive with the count at 100,000. The full string is only assembled when you copy, download, or explicitly ask to see it all.

## Privacy

Your text is processed locally in your browser and never uploaded or stored anywhere. The only thing saved is your repeater settings, in your own browser's localStorage.
