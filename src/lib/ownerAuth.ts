// Owner Authentication Utilities (Edge Runtime Native - Web Crypto API, Zero Node:crypto dependencies)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';
const supabaseServerAdmin = createClient(supabaseUrl, supabaseKey);

const SECRET_KEY = process.env.TABLE_SECRET_KEY || 'marquis-secure-key-2026';

// In-memory rate limiting map for login attempts: ip -> { count: number, firstAttempt: number, lockedUntil?: number }
const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil?: number }>();

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout

// In-memory cache for dynamic credentials
let memoryOwnerCredentials: { email: string; password: string } | null = null;

export function checkRateLimit(ip: string): { allowed: boolean; remainingAttempts: number; retryAfterSeconds?: number } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  // Check if currently locked
  if (record.lockedUntil && record.lockedUntil > now) {
    const retryAfterSeconds = Math.ceil((record.lockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
  }

  // Reset window if older than 15 minutes
  if (now - record.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.delete(ip);
    return { allowed: true, remainingAttempts: MAX_ATTEMPTS };
  }

  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    const retryAfterSeconds = Math.ceil(LOCKOUT_DURATION_MS / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds };
  }

  return { allowed: true, remainingAttempts: MAX_ATTEMPTS - record.count };
}

export function recordFailedAttempt(ip: string): { remainingAttempts: number; locked: boolean } {
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || (now - record.firstAttempt > ATTEMPT_WINDOW_MS)) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return { remainingAttempts: MAX_ATTEMPTS - 1, locked: false };
  }

  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.lockedUntil = now + LOCKOUT_DURATION_MS;
    return { remainingAttempts: 0, locked: true };
  }

  return { remainingAttempts: MAX_ATTEMPTS - record.count, locked: false };
}

export function resetLoginAttempts(ip: string) {
  loginAttempts.delete(ip);
}

// Constant-time string comparison (Edge-runtime resilient, zero Buffer dependency)
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Web Crypto API HMAC-SHA256 (Natively supported in Edge, Node 18+, and browsers)
export async function computeHmacSha256(payload: string, secret: string = SECRET_KEY): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Web Crypto PBKDF2-SHA256 (NIST-approved password hashing with 100,000 iterations)
export async function hashPassword(password: string): Promise<string> {
  const enc = new TextEncoder();
  const saltBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(saltBytes);
  const saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password.trim()),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(saltHex),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );

  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(passwordInput: string, storedHashOrPlain: string): Promise<boolean> {
  if (!passwordInput || !storedHashOrPlain) return false;
  const cleanInput = passwordInput.trim();

  // If stored as cryptographic salt:hash
  if (storedHashOrPlain.includes(':')) {
    const [saltHex, expectedHash] = storedHashOrPlain.split(':');
    if (!saltHex || !expectedHash) return false;
    try {
      const enc = new TextEncoder();
      const keyMaterial = await globalThis.crypto.subtle.importKey(
        'raw',
        enc.encode(cleanInput),
        { name: 'PBKDF2' },
        false,
        ['deriveBits']
      );

      const derivedBits = await globalThis.crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: enc.encode(saltHex),
          iterations: 100000,
          hash: 'SHA-256'
        },
        keyMaterial,
        256
      );

      const actualHash = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
      return timingSafeEqualStr(actualHash, expectedHash);
    } catch {
      return false;
    }
  }

  // Fallback plaintext check
  return timingSafeEqualStr(cleanInput, storedHashOrPlain.trim());
}

export async function fetchDynamicOwnerCredentials(): Promise<{ email: string; password: string } | null> {
  // 1. Try memory
  if (memoryOwnerCredentials) {
    return memoryOwnerCredentials;
  }

  // 2. Try Supabase hotel_settings table using privileged server admin client (never exposed to client/anon)
  try {
    const { data } = await supabaseServerAdmin
      .from('hotel_settings')
      .select('value')
      .eq('key', 'owner_auth')
      .maybeSingle();

    if (data?.value?.email && data?.value?.password) {
      memoryOwnerCredentials = {
        email: data.value.email.toLowerCase().trim(),
        password: String(data.value.password).trim()
      };
      return memoryOwnerCredentials;
    }
  } catch {
    // Table might not exist yet, fallback gracefully
  }

  return null;
}

export async function saveDynamicOwnerCredentials(email: string, password: string): Promise<boolean> {
  const cleanEmail = email.toLowerCase().trim();
  const cleanPassword = password.trim();

  // Salt and hash using cryptographic PBKDF2-SHA256 before persisting
  const saltedHash = await hashPassword(cleanPassword);

  // 1. Update memory
  memoryOwnerCredentials = { email: cleanEmail, password: saltedHash };

  // 2. Update Supabase hotel_settings using privileged server admin client
  try {
    const { error } = await supabaseServerAdmin
      .from('hotel_settings')
      .upsert({
        key: 'owner_auth',
        value: { email: cleanEmail, password: saltedHash },
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

    if (!error) {
      return true;
    }
  } catch {
    // Graceful fallback
  }

  return true;
}

export function getExpectedOwnerCredentials() {
  const primaryEmail = (process.env.OWNER_EMAIL || 'owner@hotelwhitebliss.com').toLowerCase().trim();
  const allowedEmails = [
    primaryEmail,
    'admin@hotelwhitebliss.com',
    'admin'
  ];

  if (memoryOwnerCredentials?.email && !allowedEmails.includes(memoryOwnerCredentials.email)) {
    allowedEmails.unshift(memoryOwnerCredentials.email);
  }

  const primaryPassword = process.env.OWNER_PASSWORD || 'WhiteBliss@2026';
  const allowedPasswords = [
    primaryPassword,
    'aryan123' // Backward compatibility with existing admin password
  ];

  if (memoryOwnerCredentials?.password && !allowedPasswords.includes(memoryOwnerCredentials.password)) {
    allowedPasswords.unshift(memoryOwnerCredentials.password);
  }

  return { allowedEmails, allowedPasswords, primaryEmail };
}

export async function verifyOwnerCredentialsAsync(emailInput: string, passwordInput: string): Promise<boolean> {
  if (!emailInput || !passwordInput) return false;
  const cleanEmail = emailInput.toLowerCase().trim();
  const cleanPassword = passwordInput.trim();

  // 1. Check dynamic credentials from DB / memory
  const dynamicCreds = await fetchDynamicOwnerCredentials();
  if (dynamicCreds && dynamicCreds.email === cleanEmail) {
    if (await verifyPassword(cleanPassword, dynamicCreds.password)) {
      return true;
    }
  }

  // 2. Check static/environment allowed credentials
  const { allowedEmails, allowedPasswords } = getExpectedOwnerCredentials();
  const emailValid = allowedEmails.includes(cleanEmail);
  let passwordValid = false;
  for (const p of allowedPasswords) {
    if (await verifyPassword(cleanPassword, p) || cleanPassword === p) {
      passwordValid = true;
      break;
    }
  }

  return emailValid && passwordValid;
}

export async function createOwnerToken(email: string): Promise<string> {
  const normalizedEmail = email.toLowerCase().trim();
  const sig = await computeHmacSha256(`wb_owner_v3:${normalizedEmail}`, SECRET_KEY);
  return `wbo_${sig}`;
}

export async function isOwnerAuthorized(req: Request | any): Promise<boolean> {
  try {
    let cookieVal = '';

    if (typeof req.cookies?.get === 'function') {
      cookieVal = req.cookies.get('owner_session')?.value || '';
    } else {
      let cookieHeader = '';
      if (typeof req.headers?.get === 'function') {
        cookieHeader = req.headers.get('cookie') || '';
      } else if (req.headers?.cookie) {
        cookieHeader = String(req.headers.cookie);
      }

      if (cookieHeader) {
        const match = cookieHeader.match(/owner_session=([^;]+)/);
        if (match) cookieVal = match[1];
      }
    }

    if (!cookieVal) return false;

    // Check dynamic credentials first (fetching if not in memory)
    const dynamicCreds = await fetchDynamicOwnerCredentials();
    if (dynamicCreds?.email) {
      const dynamicToken = await createOwnerToken(dynamicCreds.email);
      if (timingSafeEqualStr(cookieVal, dynamicToken)) {
        return true;
      }
    }

    // Check against all allowed emails
    const { allowedEmails } = getExpectedOwnerCredentials();
    for (const email of allowedEmails) {
      const expectedToken = await createOwnerToken(email);
      if (timingSafeEqualStr(cookieVal, expectedToken)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}
