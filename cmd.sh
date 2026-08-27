#!/usr/bin/env bash
echo "backend commit: $(git -C /opt/withus-backend rev-parse --short HEAD 2>/dev/null)"
echo
echo "=== groupama /status ==="
curl -s --max-time 25 http://127.0.0.1:4500/status; echo
echo "=== groupama /loginstate ==="
curl -s --max-time 25 http://127.0.0.1:4500/loginstate; echo
