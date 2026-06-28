R=$(curl -s --max-time 25 "http://127.0.0.1:4700/shot?b64=1&q=18")
LEN=$(printf '%s' "$R" | wc -c)
echo "shot_json_chars: $LEN"
if [ "$LEN" -lt 92000 ] && [ "$LEN" -gt 100 ]; then printf '%s' "$R"; else echo "TOO_BIG_OR_ERR"; printf '%s' "$R" | head -c 200; fi
