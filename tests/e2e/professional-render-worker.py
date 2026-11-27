"""Render deterministic source assets through the production worker composition path."""
import importlib.util
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("worker", root / "workers/professional-render/worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

with tempfile.TemporaryDirectory() as work:
    directory = Path(work)
    image = directory / "source.png"
    clip = directory / "source.mp4"
    tone = directory / "tone.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=blue:s=160x90",
                    "-frames:v", "1", "-threads", "1", str(image)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=red:s=160x90:d=1:r=24",
                    "-f", "lavfi", "-i", "sine=frequency=880:duration=1",
                    "-c:v", "libx264", "-c:a", "aac", "-shortest", str(clip)], check=True)
    subprocess.run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.4",
                    str(tone)], check=True)

    for resolution, aspect, fps, expected in [
        ("4k", "16:9", 24, (3840, 2160)), ("720p", "1:1", 30, (720, 720)),
    ]:
        destination = directory / resolution
        destination.mkdir()
        manifest = {
            "resolution": resolution, "fps": fps, "aspectRatio": aspect, "fit": "fit",
            "quality": "standard", "duckMusic": True, "audioSource": "hybrid",
            "scenes": [
                {"path": image.name, "kind": "image", "frames": fps // 2, "trimFrame": 0, "nativeGain": 0, "movement": "push", "overlay": "హనుమంతుడు"},
                {"path": clip.name, "kind": "clip", "frames": fps // 2, "trimFrame": fps // 4, "nativeGain": 0.5, "entrance": "flash"},
            ],
            "audio": [
                {"path": tone.name, "track": "narration", "startFrame": 0, "frames": fps // 2,
                 "gain": 0.5, "loop": False, "fadeFrames": 0},
                {"path": tone.name, "track": "music", "startFrame": 0, "frames": fps,
                 "gain": 0.2, "loop": True, "fadeFrames": 2},
                {"path": tone.name, "track": "ambience", "startFrame": 0, "frames": fps,
                 "gain": 0.1, "loop": True, "fadeFrames": 2},
                {"path": tone.name, "track": "sfx", "startFrame": fps // 2, "frames": fps // 2,
                 "gain": 0.4, "loop": False, "fadeFrames": 0},
            ],
        }
        phases = []
        output, metadata = worker.compose(manifest, destination,
            lambda name, file: shutil.copyfile(directory / name, file),
            lambda status, fraction: phases.append((status, fraction)), threading.Event())
        assert output.is_file()
        assert (metadata["width"], metadata["height"]) == expected
        assert metadata["fps"] == fps and metadata["audio"] == "aac"
        assert abs(metadata["duration"] - 1) <= 0.1
        assert phases[-1][0] == "validating"
        assert metadata["quality"]["peakDbfs"] > -65
        picture = subprocess.check_output([
            "ffmpeg", "-v", "error", "-ss", "0.3", "-i", str(output), "-frames:v", "1",
            "-vf", "scale=320:180", "-pix_fmt", "rgb24", "-f", "rawvideo", "-"
        ])
        assert any(min(picture[i:i + 3]) > 180 for i in range(0, len(picture), 3)), "No bright overlay pixels"

        print(f"{metadata['width']}x{metadata['height']} at {fps} FPS, AAC, verified audible")
