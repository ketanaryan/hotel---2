// Staff Authentication Utilities (Edge Runtime Native - Web Crypto API, Zero Node:crypto dependencies)
import { isOwnerAuthorized, computeHmacSha256, timingSafeEqualStr } from '@/lib/ownerAuth';

const SECRET_KEY = process.env.TABLE_SECRET_KEY || 'marquis-secure-key-2026';

export function getExpectedCredentials() {
  const user = process.env.ADMIN_USERNAME || 'admin';
  const pwd = process.env.ADMIN_PASSWORD || 'aryan123';
  return { user, pwd };
}

export async function getStaffSessionToken(): Promise<string> {
  const { user, pwd } = getExpectedCredentials();
  const sig = await computeHmacSha256(`wb_staff_v3:${user}:${pwd}`, SECRET_KEY);
  return `wb_staff_${sig}`;
}

export async function isStaffAuthorized(req: Request | any): Promise<boolean> {
  try {
    // 0. Super-admin: Owner authorization automatically confers staff authorization
    if (await isOwnerAuthorized(req)) {
      return true;
    }

    const { user: expectedUser, pwd: expectedPwd } = getExpectedCredentials();

    // 1. Check Authorization Header (Basic Auth: "Basic <base64>")
    let authHeader = '';
    if (typeof req.headers?.get === 'function') {
      authHeader = req.headers.get('authorization') || '';
    } else if (req.headers?.authorization) {
      authHeader = req.headers.authorization;
    }

    if (authHeader && authHeader.startsWith('Basic ')) {
      const b64 = authHeader.split(' ')[1];
      if (b64) {
        const decoded = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
        const [u, p] = decoded.split(':');
        if (u === expectedUser && p === expectedPwd) {
          return true;
        }
      }
    }

    const expectedToken = await getStaffSessionToken();

    // 2. Check Custom Staff Token Header
    let customToken = '';
    if (typeof req.headers?.get === 'function') {
      customToken = req.headers.get('x-staff-token') || '';
    } else if (req.headers?.['x-staff-token']) {
      customToken = req.headers['x-staff-token'];
    }

    if (customToken && timingSafeEqualStr(customToken, expectedToken)) {
      return true;
    }

    // 3. Check HttpOnly Cookie (staff_session)
    let cookieVal = '';
    if (typeof req.cookies?.get === 'function') {
      cookieVal = req.cookies.get('staff_session')?.value || '';
    } else {
      let cookieHeader = '';
      if (typeof req.headers?.get === 'function') {
        cookieHeader = req.headers.get('cookie') || '';
      } else if (req.headers?.cookie) {
        cookieHeader = String(req.headers.cookie);
      }

      if (cookieHeader) {
        const match = cookieHeader.match(/staff_session=([^;]+)/);
        if (match) cookieVal = match[1];
      }
    }

    if (cookieVal && timingSafeEqualStr(cookieVal, expectedToken)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
