#!/bin/bash
# Boots the real server on a free port, runs the save-slot end-to-end probe, then stops it.
# Nothing is mocked: real Express routes, real SQLite, real HTTP.
#
# Two footguns this guards against, both learned the hard way:
#  1. A previous run's `npx tsx` leaves the actual node child alive — the nth run then silently
#     probes the OLD process (and the old code) while thinking it tested the new one. So: refuse to
#     run if the port is already taken, and reclaim the whole process group afterwards via setsid.
#  2. HTTP_PROXY on this host turns loopback calls into upstream 502s (see the python probe).
set -u
cd "$(dirname "$0")/../.." || exit 1
PORT=${PORT:-3123}
export API_PORT=$PORT API_HOST=127.0.0.1 RP_ALLOWED_ORIGINS='*'
LOG=/tmp/rp-probe-server.log

if ss -ltn 2>/dev/null | grep -q ":$PORT "; then
  echo "端口 $PORT 已被占用 —— 拒绝在别的进程上跑探针（那会验旧代码，白跑）。"
  exit 2
fi

: > "$LOG"
setsid npx tsx --experimental-sqlite server/index.ts > "$LOG" 2>&1 &
SRV=$!
cleanup() {
  kill -TERM -"$SRV" 2>/dev/null
  sleep 1
  kill -KILL -"$SRV" 2>/dev/null
}
trap cleanup EXIT

for _ in $(seq 1 90); do
  if curl -sf --noproxy '*' "http://127.0.0.1:$PORT/api/characters" > /dev/null 2>&1; then break; fi
  sleep 1
done

if ! curl -sf --noproxy '*' "http://127.0.0.1:$PORT/api/characters" > /dev/null 2>&1; then
  echo "服务未能起来，日志尾部："
  tail -25 "$LOG"
  exit 1
fi

# Make sure the process answering us is the one we started, not a leftover.
if ! grep -qa "listening on http://127.0.0.1:$PORT" "$LOG"; then
  echo "端口有响应但不是本次启动的进程（日志里没有 listening 行）——中止。"
  tail -5 "$LOG"
  exit 3
fi

echo "服务已就绪（端口 $PORT，PID $SRV）"
python3 "$(dirname "$0")/save_slots_e2e.py"
RC=$?
echo "--- 服务日志中的错误（若有）---"
grep -a -iE "error|throw|unhandled" "$LOG" | head -8 || true
exit $RC
