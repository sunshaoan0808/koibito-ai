/**
 * Patched build: auth + server-side LLM proxy for the multi-device (PWA/phone) deployment.
 *
 * - `authGuard`: passcode session auth. `POST /api/auth/login` with `{ passcode }` sets an HttpOnly
 *   session cookie; everything under `/api` (except the login route) and `/avatars` requires it.
 *   Sessions are deterministic HMAC tokens (restart-safe, no in-memory store).
 * - `llmProxy`: forwards `/api/llm/<path>` to the upstream OpenAI-compatible gateway configured in
 *   `data/config.json` (or env), injecting the API key server-side so it never lives in a browser.
 *   Streaming (SSE) is passed through untouched.
 *
 * Config file shape (data/config.json):
 *   { "authPasscode": "...", "llmBaseUrl": "https://gw.example/v1", "llmApiKey": "sk-..." }
 * Every field can be overridden via env: RP_AUTH_PASSCODE / LLM_BASE_URL / LLM_API_KEY.
 */

import express, { type RequestHandler } from 'express'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { dataDir } from './db.ts'

interface AppConfig {
  authPasscode: string
  llmBaseUrl: string
  llmApiKey: string
}

const CONFIG_PATH = path.join(dataDir, 'config.json')

function readConfig(): AppConfig {
  const fromFile: Partial<AppConfig> = (() => {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
    } catch {
      return {}
    }
  })()
  const cfg: AppConfig = {
    authPasscode: process.env.RP_AUTH_PASSCODE || fromFile.authPasscode || '',
    llmBaseUrl: (process.env.LLM_BASE_URL || fromFile.llmBaseUrl || '').replace(/\/+$/, '').replace(/\/v1$/, ''),
    llmApiKey: process.env.LLM_API_KEY || fromFile.llmApiKey || '',
  }
  if (!cfg.authPasscode) {
    console.warn('[rp-server] no authPasscode configured (data/config.json or RP_AUTH_PASSCODE) — API auth is DISABLED')
  }
  return cfg
}

const cfg = readConfig()

// --- session auth -----------------------------------------------------------

// Deterministic session token: HMAC of the passcode. Restart-safe (no in-memory store), and
  // rotating the passcode invalidates every session at once.
  const sessionToken = crypto.createHmac('sha256', cfg.authPasscode).update('rp-session-v1').digest('hex')

export const loginHandler: RequestHandler = (req, res) => {
  const { passcode } = (req.body ?? {}) as { passcode?: string }
  if (!cfg.authPasscode) {
    res.status(400).json({ error: 'Server has no passcode configured — auth disabled' })
    return
  }
  if (typeof passcode !== 'string' || passcode !== cfg.authPasscode) {
    // Small delay to make brute force boring.
    setTimeout(() => res.status(401).json({ error: '口令错误' }), 400)
    return
  }
  res.setHeader('Set-Cookie', `rp_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`)
  res.json({ ok: true })
}

export const authGuard: RequestHandler = (req, res, next) => {
  // Login itself is the only open API route. Everything else needs a session — but when the
  // deployment has no passcode configured at all, keep the stock local-first open behavior.
  if (!cfg.authPasscode || req.path === '/auth/login') return next()
  const cookie = req.headers.cookie ?? ''
  const token = /(?:^|;\s*)rp_session=([a-f0-9]{64})/.exec(cookie)?.[1]
  if (token && token === sessionToken) return next()
  res.status(401).json({ error: '未登录' })
}

// --- LLM proxy ----------------------------------------------------------------

export const llmProxy: express.Express = express()

llmProxy.use((req, res) => {
  if (!cfg.llmBaseUrl) {
    res.status(500).json({ error: 'Server has no llmBaseUrl configured (data/config.json → llmBaseUrl)' })
    return
  }
  const url = cfg.llmBaseUrl + req.url
  const body0: Buffer[] = []
  req.on('data', (c) => body0.push(c as Buffer))
  req.on('end', () => {
    const payload = Buffer.concat(body0)
    const headers: Record<string, string> = { 'Content-Type': req.headers['content-type'] ?? 'application/json' }
    if (cfg.llmApiKey) headers.Authorization = `Bearer ${cfg.llmApiKey}`
    // Distinguish judge/assist calls (non-streaming) from the main streaming generation in the log.
    let model = '?'
    let stream = '?'
    if (payload.length && payload[0] === 0x7b) {
      try {
        const j = JSON.parse(payload.toString())
        model = j.model ?? '?'
        stream = String(!!j.stream)
      } catch {}
    }
    console.log(`[llm-proxy] -> ${req.method} ${url} model=${model} stream=${stream} body=${payload.length}B`)
    const upstream = url.startsWith('https://') ? https : http
    const upReq = upstream.request(url, { method: req.method, headers }, (upRes) => {
      // Gateway 404/5xx responses were browser-cacheable and poisoned later debugging — never cache.
      res.writeHead(upRes.statusCode ?? 502, { ...upRes.headers, 'Cache-Control': 'no-store' })
      upRes.pipe(res)
    })
    upReq.on('error', (e) => {
      console.log(`[llm-proxy] !! ${req.method} ${url} ${e.message}`)
      if (!res.headersSent) res.status(502).json({ error: `upstream request failed: ${e.message}` })
      else res.end()
    })
    if (payload.length) upReq.write(payload)
    upReq.end()
  })
})

import http from 'node:http'
import https from 'node:https'
