#!/usr/bin/env node
// Minimal App Store Connect API client — ES256 JWT signed with node:crypto, no dependencies.
//
//   ASC_KEY_ID=V546DCVRNG node scripts/asc.mjs <path> [METHOD] [jsonBody]
//
// The issuer ID is read from .asc.env (gitignored, bare UUID). The .p8 private key is looked up
// at ASC_KEY_PATH, defaulting to ~/Downloads/AuthKey_<keyid>.p8. Neither the key nor the signed
// token is ever printed.
//
// Examples:
//   node scripts/asc.mjs '/v1/apps?fields[apps]=name,bundleId'
//   node scripts/asc.mjs /v1/appStoreVersions/<id> PATCH '{"data":{...}}'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const KEY_ID = process.env.ASC_KEY_ID ?? 'V546DCVRNG'
const KEY_PATH = process.env.ASC_KEY_PATH ?? `${process.env.HOME}/Downloads/AuthKey_${KEY_ID}.p8`
const ISSUER_PATH = path.join(REPO_ROOT, '.asc.env')

function issuerId() {
  if (!fs.existsSync(ISSUER_PATH)) {
    throw new Error(`Missing ${ISSUER_PATH}. Write your App Store Connect issuer UUID into it.`)
  }
  return fs.readFileSync(ISSUER_PATH, 'utf8').trim()
}

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')

// Apple caps token lifetime at 20 minutes; 10 keeps clock skew from mattering.
function token() {
  const now = Math.floor(Date.now() / 1000)
  const header = b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })
  const payload = b64({ iss: issuerId(), iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })
  const signer = crypto.createSign('SHA256')
  signer.update(`${header}.${payload}`)
  // Apple wants a raw r||s signature, not the DER encoding node emits by default.
  const sig = signer.sign(
    { key: fs.readFileSync(KEY_PATH, 'utf8'), dsaEncoding: 'ieee-p1363' },
    'base64url'
  )
  return `${header}.${payload}.${sig}`
}

export async function asc(endpoint, { method = 'GET', body } = {}) {
  const url = endpoint.startsWith('http')
    ? endpoint
    : `https://api.appstoreconnect.apple.com${endpoint}`
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${res.status} ${method} ${endpoint}\n${text}`)
  return text ? JSON.parse(text) : null
}

// ToFi's identifiers, so callers don't have to rediscover them each time.
export const TOFI = {
  appId: '6797382662',
  appInfoId: '3eb99a5b-6cb0-4328-ac3e-54c515ea9db3',
  appInfoLocalizationId: '5213d1f8-a180-4e72-af2b-438c6c2d3c24',
  appStoreVersionId: 'b305c8aa-23bf-4465-be1e-8bd2daf70812',
  appStoreVersionLocalizationId: '5dbebd80-fc78-4f0c-963d-0bf04b28fca4',
}

if (process.argv[2]) {
  const [, , endpoint, method, bodyJson] = process.argv
  const result = await asc(endpoint, { method, body: bodyJson && JSON.parse(bodyJson) })
  console.log(JSON.stringify(result, null, 2))
}
