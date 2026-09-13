#!/usr/bin/env bash
# One-command deploy for a fresh VPS (plan row P5-3). Idempotent: re-run to rebuild and restart.
#
#   ./deploy/vps-deploy.sh --domain rp.example.com
#   ./deploy/vps-deploy.sh --domain rp.example.com --llm-base-url https://gw.example.com --llm-api-key sk-…
#   ./deploy/vps-deploy.sh --recreate          # after editing .env
#
# It never overwrites an existing .env — passcode and keys are deploy state, not scratch data.
# The API has no user accounts, so a generated passcode plus TLS in front is the minimum bar for
# exposing this anywhere but localhost.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

PORT=3001
DOMAIN=""
ORIGIN=""
LLM_BASE_URL=""
LLM_API_KEY=""
RECREATE=0

usage() {
  cat <<'USAGE'
用法：./deploy/vps-deploy.sh [选项]

  --domain <域名>        以 https://<域名> 作为允许的浏览器来源（你在外面访问的那个地址）
  --origin <来源>        直接指定 RP_ALLOWED_ORIGINS（逗号分隔可多个）；与 --domain 二选一
  --port <端口>          容器发布端口，默认 3001
  --llm-base-url <地址>  服务端 LLM 出口（例如你自建的网关）；不填则由浏览器直连后端
  --llm-api-key <密钥>   上面那个出口的密钥
  --recreate             改过 .env 之后重建容器（docker restart 不会重读 env 文件）
  -h, --help             显示本帮助
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:?--domain 需要值}"; shift 2 ;;
    --origin) ORIGIN="${2:?--origin 需要值}"; shift 2 ;;
    --port) PORT="${2:?--port 需要值}"; shift 2 ;;
    --llm-base-url) LLM_BASE_URL="${2:?--llm-base-url 需要值}"; shift 2 ;;
    --llm-api-key) LLM_API_KEY="${2:?--llm-api-key 需要值}"; shift 2 ;;
    --recreate) RECREATE=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage; exit 2 ;;
  esac
done

# --- 预检 ---
command -v docker >/dev/null 2>&1 || { echo "没装 docker：先装 Docker Engine + compose 插件。" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "缺 compose 插件（docker compose version 失败）。" >&2; exit 1; }

if [ -n "$DOMAIN" ] && [ -z "$ORIGIN" ]; then
  ORIGIN="https://$DOMAIN"
fi

# --- .env（只写一次；已存在就保留）---
PASSCODE=""
if [ -f .env ]; then
  PASSCODE="$(grep -E '^RP_AUTH_PASSCODE=' .env | head -1 | cut -d= -f2- || true)"
  if [ -n "$PASSCODE" ]; then
    echo "[deploy] .env 已存在，保留（口令已设置）；要改就编辑它再 --recreate"
  else
    echo "[deploy] .env 已存在但没有 RP_AUTH_PASSCODE —— 去加上一条再 --recreate" >&2
  fi
else
  PASSCODE="rp-$(openssl rand -hex 4 2>/dev/null || head -c 4 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  {
    echo "# 由 deploy/vps-deploy.sh 生成（已被 .gitignore 忽略）——请备份。"
    echo "TZ=${TZ:-UTC}"
    echo "RP_AUTH_PASSCODE=$PASSCODE"
    [ -n "$LLM_BASE_URL" ] && echo "LLM_BASE_URL=$LLM_BASE_URL"
    [ -n "$LLM_API_KEY" ] && echo "LLM_API_KEY=$LLM_API_KEY"
    [ -n "$ORIGIN" ] && echo "RP_ALLOWED_ORIGINS=$ORIGIN"
  } > .env
  chmod 600 .env
  echo "[deploy] 已生成 .env（口令 $PASSCODE，权限 600）"
fi

# --- 构建并启动 ---
if [ "$RECREATE" = 1 ]; then
  echo "[deploy] 构建并重建容器…"
  docker compose up -d --build --force-recreate
else
  echo "[deploy] 构建并启动…"
  docker compose up -d --build
fi

# --- 验收：UI 起身，且口令真的把门 ---
CODE=""
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/login.html" || true)"
  [ "$CODE" = 200 ] && break
  sleep 2
done
if [ "$CODE" != 200 ]; then
  echo "[deploy] ✗ UI 未就绪（最后一次 HTTP $CODE）。看日志：docker compose logs -f" >&2
  exit 1
fi
echo "[deploy] ✓ UI 200"

if [ -n "$PASSCODE" ]; then
  WRONG="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/auth/login" \
    -H 'Content-Type: application/json' -d '{"passcode":"definitely-wrong"}' || true)"
  RIGHT="$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/api/auth/login" \
    -H 'Content-Type: application/json' -d "{\"passcode\":\"$PASSCODE\"}" || true)"
  echo "[deploy] 口令闸门：错=$WRONG（应 401） 对=$RIGHT（应 200）"
  if [ "$WRONG" != 401 ] || [ "$RIGHT" != 200 ]; then
    echo "[deploy] ✗ 口令闸门不符合预期" >&2
    exit 1
  fi
else
  echo "[deploy] ⚠ 没设口令：API 鉴权是关的，别把端口直接暴露到公网" >&2
fi

echo
echo "[deploy] 完成。"
echo "  本机：http://127.0.0.1:$PORT/  ${PASSCODE:+（口令 $PASSCODE）}"
[ -n "$DOMAIN" ] && echo "  外部：https://$DOMAIN/  ← 反代需开 TLS 并把 Host 转发到 127.0.0.1:$PORT"
echo "  数据：./data（角色/对话/世界/图片都在这里，备份它）"
echo "  改过配置：docker compose up -d --force-recreate（docker restart 不重读 .env）"
