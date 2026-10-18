import { NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isStaffAuthorized } from '@/lib/staffAuth';
import { isOwnerAuthorized } from '@/lib/ownerAuth';
import { TableSection, DEFAULT_TABLE_SECTIONS, extractAllTableNumbers } from '@/lib/tableConfig';

const SECRET_KEY = process.env.TABLE_SECRET_KEY || 'marquis-secure-key-2026';
const configPath = path.join(process.cwd(), 'data', 'tables-config.json');

let memorySections: TableSection[] = [...DEFAULT_TABLE_SECTIONS];

function readSections(): TableSection[] {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        memorySections = parsed;
        return parsed;
      }
    }
  } catch {
    // Fallback to in-memory cache
  }
  return memorySections;
}

function saveSections(sections: TableSection[]) {
  memorySections = sections;
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(sections, null, 2), 'utf-8');
  } catch {
    // Fallback to memory in serverless environments
  }
}

export function generateTableToken(tableNumber: string) {
  return crypto.createHmac('sha256', SECRET_KEY).update(String(tableNumber)).digest('hex').substring(0, 10);
}

export async function GET(req: Request) {
  if (!(await isStaffAuthorized(req)) && !(await isOwnerAuthorized(req))) {
    return NextResponse.json(
      { success: false, message: 'Unauthorized: Staff or Owner credentials required to access table QR keys.' },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(req.url);
  const table = searchParams.get('table');
  const countStr = searchParams.get('count');

  const protocol = req.headers.get('x-forwarded-proto') || 'http';
  const host = req.headers.get('host') || 'localhost:3000';

  // 1. Backward-compatible Count-based query
  if (countStr) {
    const count = parseInt(countStr, 10);
    const validCount = isNaN(count) || count < 1 ? 15 : Math.min(count, 100);
    const tables = [];
    for (let i = 1; i <= validCount; i++) {
      const token = generateTableToken(i.toString());
      tables.push({
        table: i,
        qrUrl: `${protocol}://${host}/table/${i}?token=${token}`
      });
    }
    return NextResponse.json({ success: true, tables });
  }

  // 2. Backward-compatible Single Table query
  if (table) {
    const token = generateTableToken(table);
    const qrUrl = `${protocol}://${host}/table/${table}?token=${token}`;
    return NextResponse.json({ success: true, table, token, qrUrl });
  }

  // 3. Complete Floor & Table Layout (For POS, Captain, Cashier, and QR Studio)
  const sections = readSections();
  const allTables = extractAllTableNumbers(sections);

  const tables = allTables.map(tNum => {
    const token = generateTableToken(tNum);
    return {
      table: tNum,
      token,
      qrUrl: `${protocol}://${host}/table/${tNum}?token=${token}`
    };
  });

  return NextResponse.json({
    success: true,
    sections,
    allTables,
    totalTables: allTables.length,
    tables
  });
}

export async function POST(req: Request) {
  try {
    if (!(await isStaffAuthorized(req)) && !(await isOwnerAuthorized(req))) {
      return NextResponse.json({ success: false, message: 'Unauthorized staff access' }, { status: 401 });
    }

    const body = await req.json();
    const { sections } = body;

    if (!Array.isArray(sections) || sections.length === 0) {
      return NextResponse.json({ success: false, message: 'At least one floor section is required.' }, { status: 400 });
    }

    // Sanitize and validate sections
    const cleanSections: TableSection[] = [];
    for (const sec of sections) {
      if (!sec || typeof sec !== 'object') continue;
      const cleanName = String(sec.name || '').trim().slice(0, 60);
      const cleanId = String(sec.id || cleanName.toUpperCase().replace(/\s+/g, '_')).trim().slice(0, 30);
      
      const tablesRaw = Array.isArray(sec.tables) ? sec.tables : [];
      const cleanTables: string[] = [];

      for (const t of tablesRaw) {
        const cleanT = String(t).trim().slice(0, 15);
        if (cleanT && !cleanTables.includes(cleanT)) {
          cleanTables.push(cleanT);
        }
      }

      if (cleanName) {
        cleanSections.push({
          id: cleanId,
          name: cleanName,
          tables: cleanTables
        });
      }
    }

    if (cleanSections.length === 0) {
      return NextResponse.json({ success: false, message: 'Invalid floor sections format.' }, { status: 400 });
    }

    saveSections(cleanSections);
    const allTables = extractAllTableNumbers(cleanSections);

    return NextResponse.json({
      success: true,
      message: 'Restaurant floor and tables configuration updated successfully.',
      sections: cleanSections,
      allTables,
      totalTables: allTables.length
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || 'Server error updating tables' }, { status: 500 });
  }
}
