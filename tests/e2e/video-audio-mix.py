"""Local synthetic audio export smoke test. Run against the dev server in Chromium."""

import base64
import json
import math
from array import array
import os
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("VIDEO_AUDIO_TEST_BASE", "http://127.0.0.1:5191")
CHROMIUM = os.environ.get("CHROMIUM_BIN", "/usr/bin/chromium")

with tempfile.TemporaryDirectory() as directory, sync_playwright() as playwright:
    clip = Path(directory) / "native-source.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=1",
        "-f", "lavfi", "-i", "sine=frequency=880:duration=1", "-shortest",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(clip),
    ], check=True)
    browser = playwright.chromium.launch(executable_path=CHROMIUM, args=["--no-sandbox"])
    page = browser.new_page()
    fixture = BASE.rstrip("/") + "/audio-smoke.html"
    page.route(fixture, lambda route: route.fulfill(
        content_type="text/html", body="<!doctype html><title>Audio mix fixture</title>",
    ))
    page.goto(fixture)
    output = page.evaluate(
        """async (clipBase64) => {
          const { renderVideo } = await import('/src/lib/video-renderer.ts');
          const { scheduleAudioMix } = await import('/src/lib/audio-mixer.ts');
          const ctx = new OfflineAudioContext(1, 48000, 48000);
          const makeTone = (frequency) => {
            const buffer = ctx.createBuffer(1, 48000, 48000);
            const signal = buffer.getChannelData(0);
            for (let i = 0; i < signal.length; i++) signal[i] = 0.35 * Math.sin(i * frequency * 2 * Math.PI / 48000);
            return buffer;
          };
          const tone = makeTone(440);
          const mixed = new OfflineAudioContext(1, 48000 * 3, 48000);
          scheduleAudioMix({
            context: mixed, destination: mixed.destination, time: 0, durations: [1, 1, 1],
            sceneIds: ['a', 'b', 'c'], narration: [null, mixed.createBuffer(1, 48000, 48000), null],
            rates: [], cuts: [], settings: { fadeInSeconds: 0, fadeOutSeconds: 0 },
            assets: [{ track: 'music', buffer: tone, sceneIds: [], offset: 0 }],
          });
          const samples = (await mixed.startRendering()).getChannelData(0);
          const rms = (from, to) => Math.sqrt(samples.slice(from * 48000, to * 48000)
            .reduce((sum, x) => sum + x * x, 0) / ((to - from) * 48000));
          if (!(rms(1.3, 1.8) < rms(0.2, 0.7) / 2 && rms(2.4, 2.9) > rms(1.3, 1.8) * 2)) {
            throw new Error('Music ducking envelope is missing');
          }
          const outputs = {};
          const clipUrl = URL.createObjectURL(new Blob(
            [Uint8Array.from(atob(clipBase64), x => x.charCodeAt(0))], { type: 'video/mp4' }
          ));
          for (const track of ['music', 'sfx', 'native', 'hybrid', 'muted', 'fullhd-portrait']) {
            const useNative = track === 'native' || track === 'hybrid';
            const hybrid = track === 'hybrid';
            const assets = track === 'native' ? [] : [{
              track: hybrid || track === 'muted' || track === 'fullhd-portrait' ? 'music' : track,
              sceneIds: ['a'], offset: 0.1, buffer: tone
            }];
            if (hybrid) {
              assets.push({ track: 'ambience', sceneIds: ['a'], offset: 0, buffer: makeTone(550) });
              assets.push({ track: 'sfx', sceneIds: ['a'], offset: 0, buffer: makeTone(660) });
            }
            const result = await renderVideo({
              title: 'Synthetic audio smoke test', platform: 'youtube', fps: 15,
              scenes: [{ n: 1, audioSceneId: 'a', visual: '', voiceover: '', duration: '2s' }],
              sceneAudio: hybrid ? [makeTone(220)] : [], exactTimeline: true, preferredContainer: 'webm',
              audioSettings: { voiceoverEnabled: hybrid, autoDucking: false, fadeInSeconds: 0, fadeOutSeconds: 0.1 },
              mixAssets: assets,
              sceneMedia: useNative || track === 'muted' ? [{ kind: 'clip', url: clipUrl }] : undefined,
              nativeClipAudio: useNative ? [0.8] : undefined,
              exportSettings: track === 'fullhd-portrait' ? {
                resolution: '1080p', fps: 24, aspectRatio: '9:16', quality: 'standard',
                format: 'webm', fit: 'fit', subtitles: false
              } : undefined,
            });
            const data = new Uint8Array(await result.blob.arrayBuffer());
            outputs[track] = btoa(Array.from(data, x => String.fromCharCode(x)).join(''));
          }
          URL.revokeObjectURL(clipUrl);
          return outputs;
        }""", base64.b64encode(clip.read_bytes()).decode()
    )
    browser.close()

    for track, data in output.items():
        source = Path(directory) / f"{track}.webm"
        destination = Path(directory) / f"{track}.mp4"
        source.write_bytes(base64.b64decode(data))
        subprocess.run(
            ["ffmpeg", "-v", "error", "-i", str(source), "-c:v", "libx264", "-preset", "ultrafast",
             "-c:a", "aac", "-b:a", "160k", "-ar", "48000", str(destination)],
            check=True,
        )
        probe = subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(destination)],
        )
        metadata = json.loads(probe)
        assert any(s["codec_type"] == "video" for s in metadata["streams"])
        if track == "fullhd-portrait":
            video = next(stream for stream in metadata["streams"] if stream["codec_type"] == "video")
            assert (video["width"], video["height"]) == (1080, 1920), video
        assert any(s["codec_type"] == "audio" and s["codec_name"] == "aac" for s in metadata["streams"])
        assert 1.8 <= float(metadata["format"]["duration"]) <= 2.3, metadata["format"]
        raw = subprocess.check_output(
            ["ffmpeg", "-v", "error", "-i", str(destination), "-map", "0:a:0", "-ac", "1", "-ar", "48000", "-f", "s16le", "-"],
        )
        samples = array("h")
        samples.frombytes(raw)
        assert max(map(abs, samples)) > 100
        def magnitude(frequency, start=4800, end=43200):
            segment = samples[start:end]
            omega = 2 * math.pi * frequency / 48000
            return abs(sum(value * complex(math.cos(omega * i), math.sin(omega * i))
                           for i, value in enumerate(segment))) / len(segment)
        if track in ("native", "hybrid"):
            assert magnitude(880) > 50, (track, magnitude(880))
        if track == "native":
            assert magnitude(880, 57600, 86400) > 50, "Native audio did not loop with the clip"
        if track == "hybrid":
            for frequency in (220, 440, 550, 660):
                assert magnitude(frequency) > 50, (frequency, magnitude(frequency))
        if track == "muted":
            assert magnitude(880) < 10, "Muted clip audio leaked into the final mix"
        print(f"{track} export contains audible AAC and video")
