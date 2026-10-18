import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isStaffAuthorized } from '@/lib/staffAuth';
import { isOwnerAuthorized } from '@/lib/ownerAuth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_key';
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

export async function POST(req: Request) {
  try {
    // Defense-in-depth authorization check
    const authorized = (await isStaffAuthorized(req)) || (await isOwnerAuthorized(req));
    if (!authorized) {
      return NextResponse.json({ success: false, message: 'Unauthorized staff access' }, { status: 401 });
    }

    const body = await req.json();
    const { action, id, data } = body;

    const sanitizeMenuData = (input: any) => {
      if (!input || typeof input !== 'object') return {};
      const allowed: Record<string, any> = {};
      const validFields = ['name', 'price', 'category', 'section', 'description', 'image', 'image_url', 'original_price', 'is_veg', 'is_available', 'prep_time'];
      for (const field of validFields) {
        if (input[field] !== undefined) {
          allowed[field] = input[field];
        }
      }
      if (allowed.section && !allowed.category) allowed.category = allowed.section;
      if (allowed.category && !allowed.section) allowed.section = allowed.category;
      return allowed;
    };

    if (!action || !['insert', 'update', 'delete'].includes(action)) {
      return NextResponse.json({ success: false, message: 'Invalid or missing action. Must be insert, update, or delete.' }, { status: 400 });
    }

    if (action === 'insert') {
      const sanitized = sanitizeMenuData(data);
      if (Object.keys(sanitized).length === 0 || !sanitized.name || typeof sanitized.price !== 'number') {
        return NextResponse.json({ success: false, message: 'Valid name and numeric price are required for menu item.' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from('menu').insert([sanitized]);
      if (error) throw error;
    } else if (action === 'update') {
      const cleanId = parseInt(String(id), 10);
      if (isNaN(cleanId) || cleanId <= 0) {
        return NextResponse.json({ success: false, message: 'Invalid menu item ID' }, { status: 400 });
      }
      const sanitized = sanitizeMenuData(data);
      if (Object.keys(sanitized).length === 0) {
        return NextResponse.json({ success: false, message: 'No valid menu fields provided to update.' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from('menu').update(sanitized).eq('id', cleanId);
      if (error) throw error;
    } else if (action === 'delete') {
      const cleanId = parseInt(String(id), 10);
      if (isNaN(cleanId) || cleanId <= 0) {
        return NextResponse.json({ success: false, message: 'Invalid menu item ID' }, { status: 400 });
      }
      const { error } = await supabaseAdmin.from('menu').delete().eq('id', cleanId);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
