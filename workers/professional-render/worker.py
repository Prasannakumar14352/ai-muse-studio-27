"""Single-concurrency, persistent FFmpeg worker. Only reads configured Supabase storage."""
import datetime
import http.server
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

LOGGER = logging.getLogger("professional-render")
INPUT_BUCKET = "professional-render-inputs"
OUTPUT_BUCKET = "professional-renders"
PROBE_FORMATS = "mov,matroska,webm,jpeg_pipe,png_pipe,webp_pipe,mp3,wav"
MAX_BYTES = 50 * 1024 * 1024
OUTPUT_BYTES = 100 * 1024 * 1024


class RenderError(Exception):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs):
        return None


class Supabase:
    def __init__(self, origin, token):
        parsed = urllib.parse.urlsplit(origin)
        if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.query:
            raise ValueError("Invalid Supabase origin")
        self.origin = origin.rstrip("/")
        self.token = token
        self.opener = urllib.request.build_opener(NoRedirect())

    def request(self, path, method="GET", body=None, content_type="application/json", prefer=None):
        headers = {"apikey": self.token, "Authorization": f"Bearer {self.token}", "Content-Type": content_type}
        if prefer:
            headers["Prefer"] = prefer
        if body is not None and content_type == "application/json":
            body = json.dumps(body).encode()
        req = urllib.request.Request(self.origin + path, data=body, headers=headers, method=method)
        return self.opener.open(req, timeout=30)

    def claim(self):
        with self.request("/rest/v1/rpc/claim_professional_render", "POST", {}) as result:
            return json.load(result)

    def update(self, job, data):
        target = "/rest/v1/professional_render_jobs?" + urllib.parse.urlencode({
            "id": "eq." + job["id"], "lease_id": "eq." + job["lease_id"],
        })
        data = {**data, "heartbeat_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
        with self.request(target, "PATCH", data, prefer="return=representation") as response:
            return bool(json.load(response))

    def download(self, owner, name, target):
        if not name.startswith(owner + "/") or not re.fullmatch(r"[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+", name):
            raise RenderError("Invalid asset reference")
        path = "/storage/v1/object/authenticated/" + INPUT_BUCKET + "/" + urllib.parse.quote(name)
        with self.request(path) as source, target.open("wb") as output:
            total = 0
            while chunk := source.read(128 * 1024):
                total += len(chunk)
                if total > MAX_BYTES:
                    raise RenderError("Asset exceeds the worker size limit")
                output.write(chunk)

    def upload(self, path, file):
        if file.stat().st_size > OUTPUT_BYTES:
            raise RenderError("Output exceeds the worker storage limit")
        target = "/storage/v1/object/" + OUTPUT_BUCKET + "/" + urllib.parse.quote(path)
        with self.request(target, "POST", file.read_bytes(), "video/mp4"):
            pass


def run(command, cancelled, timeout=180):
    # Temporary-file output avoids deadlock when FFmpeg writes diagnostic output.
    with tempfile.TemporaryFile() as log:
        with subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL) as child:
            deadline = time.monotonic() + timeout
            while child.poll() is None:
                if cancelled.wait(0.15) or time.monotonic() > deadline:
                    child.kill()
                    child.wait()
                    raise RenderError("Render cancelled or exceeded its time limit")
            log.seek(0)
            result = log.read(1024 * 1024).decode(errors="replace")
            if child.returncode:
                LOGGER.warning("Media process rejected input (%d)", child.returncode)
                raise RenderError("Media is invalid or could not be encoded")
            return result


def probe(path, cancelled):
    return json.loads(run([
        "ffprobe", "-v", "error", "-protocol_whitelist", "file",
        "-format_whitelist", PROBE_FORMATS, "-show_streams", "-show_format", "-of", "json", str(path),
    ], cancelled, 15))


def dimensions(settings):
    height = {"720p": 720, "1080p": 1080, "4k": 2160}[settings["resolution"]]
    width = height * 16 // 9
    return {"16:9": (width, height), "9:16": (height, width), "1:1": (height, height)}[settings["aspectRatio"]]


def input_args(path):
    return ["-protocol_whitelist", "file", "-format_whitelist", PROBE_FORMATS, "-i", str(path)]


def compose(manifest, directory, download, progress, cancelled):
    """Compose a v1 cut timeline from source bytes, with independent audio tracks."""
    fps = manifest["fps"]
    width, height = dimensions(manifest)
    duration = sum(scene["frames"] for scene in manifest["scenes"]) / fps
    crf, audio_rate = {"standard": (23, "128k"), "high": (19, "192k"), "maximum": (16, "256k")}[manifest["quality"]]
    clip_args = ["-c:v", "libx264", "-threads", "2", "-preset", "veryfast", "-crf", str(crf), "-pix_fmt", "yuv420p"]
    ffmpeg = ["ffmpeg", "-v", "error", "-nostdin", "-y", "-filter_threads", "2", "-filter_complex_threads", "2"]
    fit = manifest["fit"] == "fit"
    geometry = f"scale={width}:{height}:force_original_aspect_ratio={'decrease' if fit else 'increase'}"
    geometry += f",{('pad' if fit else 'crop')}={width}:{height}" + (":(ow-iw)/2:(oh-ih)/2" if fit else "")
    segments = []
    audio = []
    cache = {}

    def asset(path):
        if path not in cache:
            if shutil.disk_usage(directory).free < 512 * 1024 * 1024:
                raise RenderError("Insufficient worker disk space")
            file = directory / f"asset-{len(cache)}"
            download(path, file)
            cache[path] = (file, probe(file, cancelled))
        return cache[path]

    progress("preparing_assets", 0.02)
    for item in [*manifest["scenes"], *manifest["audio"]]:
        asset(item["path"])
    start = 0
    for index, scene in enumerate(manifest["scenes"]):
        path, info = asset(scene["path"])
        video = next((item for item in info["streams"] if item["codec_type"] == "video"), None)
        if not video or not 0 < video.get("width", 0) <= 4096 or not 0 < video.get("height", 0) <= 4096:
            raise RenderError("Source video dimensions are invalid or unsupported")
        seconds = scene["frames"] / fps
        trim = scene["trimFrame"] / fps
        is_image = scene["kind"] == "image"
        segment = directory / f"segment-{index}.mp4"
        seek = [] if is_image else ["-ss", str(trim)]
        tail = f"tpad=stop_mode=clone:stop_duration={seconds}"
        run([*ffmpeg, *seek, *input_args(path), "-map", "0:v:0", "-an",
             "-vf", f"{geometry},setsar=1,fps={fps},{tail}",
             "-frames:v", str(scene["frames"]), *clip_args, str(segment)], cancelled)
        segments.append(segment)
        if scene["nativeGain"] > 0:
            audio.append((path, "native", trim, start, seconds, scene["nativeGain"], False, 0))
        start += seconds
        progress("rendering", 0.1 + 0.65 * (index + 1) / len(manifest["scenes"]))

    for track in manifest["audio"]:
        if track["gain"] > 0:
            audio.append((asset(track["path"])[0], track["track"], 0, track["startFrame"] / fps,
                          track["frames"] / fps, track["gain"], track["loop"], track["fadeFrames"] / fps))
    listing = directory / "timeline.txt"
    listing.write_text("".join(f"file '{segment.name}'\n" for segment in segments))
    args = [*ffmpeg, "-f", "concat", "-safe", "1", "-i", str(listing)]
    filters = []
    buses = {"narration": [], "music": [], "other": []}
    for index, (path, track, trim, offset, length, gain, loop, fade) in enumerate(audio, start=1):
        args.extend([*(["-stream_loop", "-1"] if loop else []), *(["-ss", str(trim)] if trim else []), *input_args(path)])
        fade = min(fade, length / 2)
        chain = f"aresample=48000,atrim=duration={length},asetpts=PTS-STARTPTS,volume={gain}"
        if fade:
            chain += f",afade=t=in:d={fade},afade=t=out:st={length-fade}:d={fade}"
        name = f"a{index}"
        filters.append(f"[{index}:a:0]{chain},adelay={round(offset * 1000)}:all=1[{name}]")
        buses[track if track in ("narration", "music") else "other"].append(name)
    def join(names, label):
        if len(names) == 1:
            return names[0]
        filters.append("".join(f"[{name}]" for name in names) + f"amix=inputs={len(names)}:normalize=0[{label}]")
        return label
    mixed = buses["other"]
    narration = join(buses["narration"], "voice") if buses["narration"] else None
    music = join(buses["music"], "music") if buses["music"] else None
    if narration and music and manifest["duckMusic"]:
        filters.append(f"[{narration}]apad,asplit[voiceout][key]")
        filters.append(f"[{music}][key]sidechaincompress=threshold=0.03:ratio=6:attack=15:release=250[ducked]")
        narration, music = "voiceout", "ducked"
    mixed.extend(item for item in (narration, music) if item)
    if mixed:
        source = join(mixed, "mix")
        filters.append(f"[{source}]alimiter=limit=0.9:level=0,apad,atrim=duration={duration}[outaudio]")
        args += ["-filter_complex", ";".join(filters), "-map", "0:v:0", "-map", "[outaudio]",
                 "-c:a", "aac", "-b:a", audio_rate, "-ar", "48000"]
    else:
        args += ["-map", "0:v:0", "-an"]
    output = directory / "output.mp4"
    progress("encoding", 0.8)
    run([*args, "-c:v", "copy", "-movflags", "+faststart", "-t", str(duration), str(output)], cancelled)
    progress("validating", 0.9)
    metadata = probe(output, cancelled)
    video = next((item for item in metadata["streams"] if item["codec_type"] == "video"), {})
    audio_stream = next((item for item in metadata["streams"] if item["codec_type"] == "audio"), {})
    actual_duration = float(metadata["format"]["duration"])
    numerator, denominator = map(int, video.get("avg_frame_rate", "0/1").split("/"))
    actual_fps = numerator / denominator if denominator else 0
    if (video.get("width"), video.get("height"), video.get("codec_name")) != (width, height, "h264") or (
        abs(actual_duration - duration) > 0.15 or abs(actual_fps - fps) > 0.05
    ) or (mixed and (audio_stream.get("codec_name"), audio_stream.get("sample_rate")) != ("aac", "48000")):
        raise RenderError("Encoded output differs from the manifest")
    if mixed:
        volume = run(["ffmpeg", "-v", "info", *input_args(output), "-vn", "-af", "volumedetect", "-f", "null", "-"], cancelled, 45)
        peak = re.search(r"max_volume: (-?[\d.]+) dB", volume)
        if not peak or float(peak[1]) < -75:
            raise RenderError("Audio was requested but the output is silent")
    return output, {"width": width, "height": height, "fps": actual_fps, "duration": actual_duration,
                    "codec": "h264", "audio": audio_stream.get("codec_name"), "bytes": output.stat().st_size}


def process_job(client, job):
    stopped = threading.Event()
    finished = threading.Event()
    watchdog = threading.Timer(900, stopped.set)
    watchdog.start()

    def heartbeat():
        while not finished.wait(15):
            try:
                if not client.update(job, {}):
                    stopped.set()
                    return
            except (OSError, ValueError):
                stopped.set()
                return

    def progress(status, value):
        if stopped.is_set() or not client.update(job, {"status": status, "progress": value}):
            stopped.set()
            raise RenderError("Render lease is no longer active")

    thread = threading.Thread(target=heartbeat, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="professional-render-") as temp:
            output, metadata = compose(job["manifest"], Path(temp),
                lambda name, file: client.download(job["user_id"], name, file), progress, stopped)
            progress("uploading", 0.95)
            path = f"{job['user_id']}/{job['id']}/{job['lease_id']}.mp4"
            client.upload(path, output)
            client.update(job, {"status": "completed", "progress": 1, "output_path": path,
                                "output_metadata": metadata,
                                "completed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()})
            LOGGER.info("Render complete %s", job["id"])
    except (OSError, ValueError, KeyError, RenderError):
        LOGGER.warning("Render failed %s", job["id"])
        if not stopped.is_set():
            try:
                client.update(job, {"status": "failed", "error": "Render failed. Check source media and worker configuration."})
            except OSError:
                LOGGER.warning("Could not record render failure %s", job["id"])
    finally:
        watchdog.cancel()
        finished.set()
        thread.join()


class Health(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        self.send_response(200 if self.path == "/health" else 404)
        self.end_headers()


def main():
    logging.basicConfig(level=logging.INFO)
    client = Supabase(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    server = http.server.ThreadingHTTPServer(("0.0.0.0", 8080), Health)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    while True:
        try:
            job = client.claim()
            if job:
                process_job(client, job)
                continue
        except OSError:
            LOGGER.warning("Render queue unavailable")
        time.sleep(5)


if __name__ == "__main__":
    main()
