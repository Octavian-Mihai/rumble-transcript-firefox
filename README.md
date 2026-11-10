# Rumble Transcript Copier

Firefox extension that copies the current Rumble video’s captions to the clipboard as timestamped text:

```
[0:12] Hello everyone
[0:18] Today we are going to...
```

Use the toolbar icon or the **Copy transcript** button next to the video actions.

## How it works

1. `content/content.js` reads the video’s embed id from the page (`oembed` link; the id in the page URL is *not* the embed id).
2. It fetches `/embedJS/u3/?request=video&ver=2&v=<embedId>`, whose `cc` field lists WebVTT caption tracks.
3. It picks a track (manual before auto-generated, English first), converts the VTT to `[m:ss] text` lines and writes them to the clipboard.

Videos without captions show “This video has no captions.”

## Develop

Load temporarily in Firefox: `about:debugging` → This Firefox → Load Temporary Add-on → select `manifest.json`.
