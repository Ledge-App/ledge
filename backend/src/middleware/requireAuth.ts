import jwt from 'jsonwebtoken'

export function verifyJwt(token: string): { userId: string } {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) {
    throw new Error('SUPABASE_JWT_SECRET is not set')
  }
  const payload = jwt.verify(token, secret) as jwt.JwtPayload
  if (!payload.sub) {
    throw new Error('JWT missing subject claim')
  }
  return { userId: payload.sub }
}
