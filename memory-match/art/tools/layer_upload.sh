#!/usr/bin/env bash
# Two-step resumable upload of a local file to a Layer signed URL.
#
# The Layer MCP `upload_file` tool only takes a PUBLIC http(s) URL, which a local
# repo file does not have. `request_file_upload_url` is the local-file path: it
# returns {file_id, upload_url}, and the bytes go up via the GCS resumable
# protocol below. That file_id is then reusable across any number of forge runs.
#
#   layer_upload.sh <upload_url> <content_type> <path>
#
# The signed URL lists `x-goog-content-length-range` in X-Goog-SignedHeaders, so
# the POST MUST send it and it MUST read exactly `0,<file_size_bytes>` — the same
# number given to request_file_upload_url. Omit it and GCS 400s with
# MalformedSecurityHeader; guess the value (e.g. the 64MB cap) and it 403s. So the
# size passed to the MCP tool has to be the file's real byte count, not an
# estimate: `wc -c` it, don't round.
#
# Prints nothing on success (the file_id comes from the MCP call, not from here);
# exits non-zero with the server's response on failure.
set -euo pipefail

url="$1"; ctype="$2"; path="$3"
[ -f "$path" ] || { echo "no such file: $path" >&2; exit 1; }
size=$(wc -c < "$path" | tr -d ' ')

# Step 1 — initiate the resumable session. The session URI comes back in Location.
session=$(curl -sS -X POST "$url" \
    -H "Content-Type: $ctype" \
    -H "x-goog-resumable: start" \
    -H "x-goog-content-length-range: 0,$size" \
    -D - -o /dev/null \
  | tr -d '\r' | awk 'tolower($1)=="location:"{print $2}')

[ -n "$session" ] || { echo "no Location header — signed URL expired?" >&2; exit 1; }

# Step 2 — the bytes.
code=$(curl -sS -X PUT "$session" \
    -H "Content-Type: $ctype" \
    --data-binary "@$path" \
    -o /tmp/layer_upload_resp -w '%{http_code}')

case "$code" in
  200|201) exit 0 ;;
  *) echo "upload failed HTTP $code" >&2; cat /tmp/layer_upload_resp >&2; exit 1 ;;
esac
