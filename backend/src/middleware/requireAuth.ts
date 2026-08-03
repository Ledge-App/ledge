import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'

// Supabase projects created after mid-2025 default to asymmetric JWT Signing Keys
// (ES256/RS256, verified via JWKS) instead of the legacy shared HS256 secret.
// Both are supported here since either can be true depending on the project.
const client = jwksClient({
  jwksUri: `${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
})

function getSigningKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  if (!header.kid) {
    callback(new Error('JWT is missing a kid header, cannot look up its signing key'))
    return
  }
  client.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error('No signing key found for this kid'))
      return
    }
    callback(null, key.getPublicKey())
  })
}

export function verifyJwt(token: string): Promise<{ userId: string }> {
  const decoded = jwt.decode(token, { complete: true })
  const alg = decoded?.header.alg

  if (alg === 'HS256') {
    const secret = process.env.SUPABASE_JWT_SECRET
    if (!secret) {
      return Promise.reject(new Error('SUPABASE_JWT_SECRET is not set'))
    }
    return new Promise((resolve, reject) => {
      jwt.verify(token, secret, (err, payload) => {
        if (err || !payload || typeof payload === 'string' || !payload.sub) {
          reject(err ?? new Error('JWT missing subject claim'))
          return
        }
        resolve({ userId: payload.sub })
      })
    })
  }

  return new Promise((resolve, reject) => {
    jwt.verify(token, getSigningKey, { algorithms: ['ES256', 'RS256'] }, (err, payload) => {
      if (err || !payload || typeof payload === 'string' || !payload.sub) {
        reject(err ?? new Error('JWT missing subject claim'))
        return
      }
      resolve({ userId: payload.sub })
    })
  })
}
