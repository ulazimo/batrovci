#!/usr/bin/env bash
# Syntax-check every game module in load order, and flag references to globals
# nothing defines.
#
# Worth running before any browser check: a SyntaxError in a classic script kills
# every declaration in that file, so the failure surfaces somewhere unrelated
# ("SHOOT_Y is not defined" from match.js when the real error was in camera.js)
# and the browser console does not always show the parse error itself.
#
#   bash debug/check.sh
cd "$(dirname "$0")/.." || exit 1

FILES=$(grep -o 'src="[a-z-]*\.js"' index.html | sed 's/src="//;s/"//')

fail=0
for f in $FILES; do
  if [ ! -f "$f" ]; then
    echo "MISSING  $f (referenced by index.html)"
    fail=1
    continue
  fi
  if ! out=$(node --check "$f" 2>&1); then
    echo "SYNTAX   $f"
    echo "$out" | sed 's/^/         /'
    fail=1
  fi
done

[ $fail -eq 0 ] && echo "syntax OK — $(echo "$FILES" | wc -w | tr -d ' ') modules"
exit $fail
