import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose'

// Supabase projects created after mid-2025 default to asymmetric JWT Signing Keys
// (ES256/RS256, verified via JWKS) instead of the legacy shared HS256 secret.
// Both are supported here since either can be true depending on the project.
//
// Uses `jose` directly rather than `jsonwebtoken` + `jwks-rsa`: jose is ESM-native,
// while jwks-rsa is CommonJS and internally `require()`s jose itself — jose v5+ is
// pure ESM, so that require() hard-crashes with ERR_REQUIRE_ESM in strict serverless
// runtimes (observed on Vercel; not reproducible locally under tsx's looser loader).
let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined

function getRemoteJwks() {
  if (!remoteJwks) {
    remoteJwks = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  }
  return remoteJwks
}

// Email comes from the same verified signature as the subject, so it needs no separate
// trust decision — but it is optional (service-role and anonymous tokens carry no email),
// hence null rather than a throw.
function claims(payload: { sub?: string; email?: unknown }): { userId: string; email: string | null } {
  if (!payload.sub) {
    throw new Error('JWT missing subject claim')
  }
  return { userId: payload.sub, email: typeof payload.email === 'string' ? payload.email : null }
}

export async function verifyJwt(token: string): Promise<{ userId: string; email: string | null }> {
  const { alg } = decodeProtectedHeader(token)

  if (alg === 'HS256') {
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) {
      throw new Error('SUPABASE_JWT_SECRET is not set')
    }
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ['HS256'] })
    return claims(payload)
  }

  const { payload } = await jwtVerify(token, getRemoteJwks(), { algorithms: ['ES256', 'RS256'] })
  return claims(payload)
}
