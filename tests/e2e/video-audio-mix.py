"""Local synthetic audio export smoke test. Run against the dev server in Chromium."""

import base64
import json
import os
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("VIDEO_AUDIO_TEST_BASE", "http://127.0.0.1:5191")
CHROMIUM = os.environ.get("CHROMIUM_BIN", "/usr/bin/chromium")

with tempfile.TemporaryDirectory() as directory, sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=CHROMIUM, args=["--no-sandbox"])
    page = browser.new_page()
    fixture = BASE.rstrip("/") + "/audio-smoke.html"
    page.route(fixture, lambda route: route.fulfill(
        content_type="text/html", body="<!doctype html><title>Audio mix fixture</title>",
    ))
    page.goto(fixture)
    output = page.evaluate(
        """async () => {
          const { renderVideo } = await import('/src/lib/video-renderer.ts');
          const { scheduleAudioMix } = await import('/src/lib/audio-mixer.ts');
          const ctx = new OfflineAudioContext(1, 48000, 48000);
          const tone = ctx.createBuffer(1, 48000, 48000);
          const signal = tone.getChannelData(0);
          for (let i = 0; i < signal.length; i++) signal[i] = 0.35 * Math.sin(i * 440 * 2 * Math.PI / 48000);
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
          for (const track of ['music', 'sfx']) {
            const result = await renderVideo({
              title: 'Synthetic audio smoke test', platform: 'youtube', fps: 15,
              scenes: [{ n: 1, audioSceneId: 'a', visual: '', voiceover: '', duration: '2s' }],
              sceneAudio: [], exactTimeline: true, preferredContainer: 'webm',
              audioSettings: { voiceoverEnabled: false, fadeInSeconds: 0, fadeOutSeconds: 0.1 },
              mixAssets: [{ track, sceneIds: ['a'], offset: 0.1, buffer: tone }],
            });
            const data = new Uint8Array(await result.blob.arrayBuffer());
            outputs[track] = btoa(Array.from(data, x => String.fromCharCode(x)).join(''));
          }
          return outputs;
        }"""
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
        assert any(s["codec_type"] == "audio" and s["codec_name"] == "aac" for s in metadata["streams"])
        assert 1.8 <= float(metadata["format"]["duration"]) <= 2.3, metadata["format"]
        raw = subprocess.check_output(
            ["ffmpeg", "-v", "error", "-i", str(destination), "-map", "0:a:0", "-f", "s16le", "-"],
        )
        assert max(abs(int.from_bytes(raw[i:i + 2], "little", signed=True)) for i in range(0, len(raw), 2)) > 100
        print(f"{track}-only export contains audible AAC and video")
