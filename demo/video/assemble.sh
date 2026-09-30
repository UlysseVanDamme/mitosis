#!/usr/bin/env bash
# Cut the recorded shots (out/manifest.json from record.py) to their planned length,
# concat them into out/mitosis_demo.mp4 (H.264, 1920x1080, 30 fps), write
# out/voiceover.srt from shots.json with the same timings, and, if demo/video/voice.wav
# exists (or VOICE=path), mux it in as the audio track.
#
#   bash demo/video/assemble.sh
#   VOICE=~/voice.m4a bash demo/video/assemble.sh
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$HERE/out"
CLIPS="$OUT/clips"
MANIFEST="$OUT/manifest.json"
FINAL="$OUT/mitosis_demo.mp4"
VOICE="${VOICE:-$HERE/voice.wav}"
CRF="${CRF:-18}"

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
[ -f "$MANIFEST" ] || { echo "no $MANIFEST: run uv run demo/video/record.py first" >&2; exit 1; }
mkdir -p "$CLIPS"
rm -f "$CLIPS"/*.mp4 "$OUT/concat.txt"

# One line per clip: index, id, raw video (relative to out/), start, duration.
python3 - "$MANIFEST" > "$OUT/clips.tsv" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
for i, c in enumerate(m["clips"]):
    print(f'{i:02d}\t{c["id"]}\t{c["video"]}\t{c["start"]}\t{c["dur"]}')
PY

while IFS=$'\t' read -r idx id video start dur; do
  src="$OUT/$video"
  [ -f "$src" ] || { echo "missing raw video for $id: $src" >&2; exit 1; }
  dst="$CLIPS/${idx}_${id}.mp4"
  echo "[assemble] $id: ${dur}s from ${start}s"
  # tpad clones the last frame if the raw recording is a little short, -t cuts to the exact length.
  ffmpeg -nostdin -loglevel error -y -ss "$start" -i "$src" -t "$dur" \
    -vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0b1220,fps=30,tpad=stop_mode=clone:stop_duration=${dur},setsar=1" \
    -t "$dur" -an -c:v libx264 -preset medium -crf "$CRF" -pix_fmt yuv420p -r 30 "$dst"
  echo "file '$dst'" >> "$OUT/concat.txt"
done < "$OUT/clips.tsv"

ffmpeg -nostdin -loglevel error -y -f concat -safe 0 -i "$OUT/concat.txt" -c copy -movflags +faststart "$FINAL"

# Subtitles: cue times from shots.json, offset by the planned length of the clips before it.
python3 - "$HERE/shots.json" "$OUT/clips.tsv" > "$OUT/voiceover.srt" <<'PY'
import json, sys
shots = {s["id"]: s for s in json.load(open(sys.argv[1]))["shots"]}
def ts(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
n, off = 0, 0.0
for line in open(sys.argv[2]):
    _, sid, _, _, dur = line.rstrip("\n").split("\t")
    for a, b, text in shots[sid]["vo"]:
        n += 1
        print(f"{n}\n{ts(off + a)} --> {ts(off + b)}\n{text}\n")
    off += float(dur)
PY

if [ -f "$VOICE" ]; then
  echo "[assemble] muxing voice track $(basename "$VOICE")"
  mv "$FINAL" "$OUT/mitosis_demo_novoice.mp4"
  # apad + -shortest: a short voice track is padded with silence, a long one is cut at the video's end.
  ffmpeg -nostdin -loglevel error -y -i "$OUT/mitosis_demo_novoice.mp4" -i "$VOICE" \
    -map 0:v -map 1:a -c:v copy -af apad -c:a aac -b:a 192k -shortest -movflags +faststart "$FINAL"
fi

dur=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$FINAL")
echo "[assemble] $FINAL: ${dur}s"
echo "[assemble] $OUT/voiceover.srt"
python3 -c "import sys; d=float(sys.argv[1]); sys.exit(0 if d < 175 else 'video is %.1fs, over 2:55' % d)" "$dur"
