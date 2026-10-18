import crypto from 'crypto';

export function verifyTableToken(table: string, token: string | null): boolean {
  if (process.env.NODE_ENV !== 'production' && !token) return true; // Allow dev testing without token
  if (!token || typeof token !== 'string') return false;
  
  const SECRET_KEY = process.env.TABLE_SECRET_KEY || 'marquis-secure-key-2026';
  const cleanTable = String(table || '').trim();
  if (!cleanTable) return false;

  const expectedToken = crypto
    .createHmac('sha256', SECRET_KEY)
    .update(cleanTable)
    .digest('hex')
    .substring(0, 10);
  
  if (token.length !== expectedToken.length) return false;

  try {
    return crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expectedToken, 'utf8'));
  } catch {
    return false;
  }
}

