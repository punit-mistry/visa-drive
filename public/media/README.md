# Ambient video

## What is here

`tokyo-night.mp4` — Shibuya Crossing at night. 20s, 1920x1080, 30fps, silent,
~2.8MB. It plays behind the closing section on the homepage.
`tokyo-night.jpg` — a frame from that clip, used as its poster and as the
still whenever the video does not play.

Source: Pexels (commercial use permitted). Encoded from a 2560x1440 60fps
master with the command below.

## Hero stills

`hero-destinations.jpg` — a traveller with luggage crossing a sunlit terminal.
The masthead for `/destinations`, in both catalogue and search-result modes.
`hero-services.jpg` — hands annotating an application document set. The
masthead for `/services`.

Both are 2400×1600 JPEGs from Pexels (commercial use permitted, attribution
not required), saved locally rather than hot-linked. They sit at 60% opacity
behind two scrims, so nothing in either frame has to be legible — the copy
above them is what carries the page.

Neither carries a logo or a recognizable face: the destinations frame is
backlit and shot from behind, so the people in it read as silhouettes.

Any clip added here is played through `components/marketing/ambient-video.tsx`,
which declines to load it under reduced motion, on Data Saver, or on a slow
connection, and falls back to the still on any decode error. There is no
broken state, so a section is safe to ship with or without its video.

## Adding another clip

A short, quiet, cinematic travel clip — the kind of footage the rest of the
site is art-directed around: architecture, streets, landscapes, aerials. No
on-screen text, no logos, no faces in close-up, nothing that reads as stock.

## Specs

| | |
|---|---|
| Format | H.264 MP4 (add `hero.webm` too if you want VP9/AV1 for smaller files) |
| Resolution | 1920×1080 is plenty — it sits behind a dark scrim |
| Length | 8–15 seconds, cut so the loop point is invisible |
| Frame rate | 24 or 30 fps |
| Audio | **Strip it.** The video is muted and autoplaying; an audio track is dead weight |
| File size | Aim under 4 MB. Above ~6 MB it is costing more than it adds |

A reasonable encode:

```bash
ffmpeg -i source.mov -an -c:v libx264 -crf 26 -preset slow \
  -vf "scale=1920:-2" -movflags +faststart hero.mp4
```

`-an` strips audio. `+faststart` moves the index to the front of the file so
playback can begin before the whole thing has downloaded.

## Licensing

Use footage you have the right to use commercially — Pexels, Coverr, Mixkit
and Artgrid all offer clips cleared for this. **Do not** save a video off a
Google Images or YouTube result; that is someone else's copyright and this is
a commercial site.

Keep a note of where each clip came from and under what licence.
