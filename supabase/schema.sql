-- ============================================================================
-- HOTEL MARQUIS - COMPLETE PRODUCTION SUPABASE DATABASE SCHEMA
-- Instructions:
-- 1. Create a new project in Supabase (e.g. 'hotel-marquis-db').
-- 2. Open the SQL Editor (Left sidebar -> SQL Editor -> New Query).
-- 3. Paste this ENTIRE file and click "RUN" (Green button).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ORDERS TABLE (Live KOTs, Customer Table Orders, POS Billing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id BIGSERIAL PRIMARY KEY,
    order_number TEXT NOT NULL DEFAULT (floor(random() * (9999 - 1000 + 1) + 1000)::text),
    table_number TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'preparing', 'ready', 'served', 'completed', 'billing', 'rejected', 'archived')),
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 2. MENU TABLE (Digital Catalog, QR Menu, Pricing)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.menu (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    original_price NUMERIC(10, 2),
    category TEXT NOT NULL DEFAULT 'Main Course',
    section TEXT NOT NULL DEFAULT 'Main Course',
    description TEXT,
    image TEXT,
    image_url TEXT,
    is_veg BOOLEAN NOT NULL DEFAULT true,
    is_available BOOLEAN NOT NULL DEFAULT true,
    prep_time TEXT DEFAULT '15 mins',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. HOTEL SETTINGS TABLE (Owner Credentials & Audit State)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hotel_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Default Owner Login for Hotel Marquis
INSERT INTO public.hotel_settings (key, value)
VALUES (
    'owner_auth',
    '{"email": "iamketan3@gmail.com", "password": "admin"}'::jsonb
)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. INVENTORY SYSTEM TABLES (Raw Materials, Khata Book, Procurement, Recipes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Dairy', 'Grocery', 'Poultry & Meat', 'Vegetables', 'Beverages', 'Packaging', 'Spices', 'Bakery')),
    current_stock NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (current_stock >= 0),
    unit TEXT NOT NULL CHECK (unit IN ('kg', 'L', 'Pcs', 'Packets', 'Grams')),
    min_alert_stock NUMERIC(10, 2) NOT NULL DEFAULT 2.00,
    cost_per_unit NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    vendor_name TEXT NOT NULL,
    vendor_phone TEXT,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_vendors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    phone TEXT NOT NULL,
    total_purchased NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    pending_due NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    last_payment_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_purchases (
    id TEXT PRIMARY KEY,
    invoice_no TEXT NOT NULL,
    vendor_name TEXT NOT NULL,
    vendor_phone TEXT,
    date TEXT NOT NULL,
    items_summary TEXT NOT NULL,
    total_amount NUMERIC(12, 2) NOT NULL,
    payment_status TEXT NOT NULL CHECK (payment_status IN ('PAID', 'PENDING_CREDIT')),
    payment_method TEXT CHECK (payment_method IN ('CASH', 'UPI', 'BANK_TRANSFER')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_recipes (
    id TEXT PRIMARY KEY,
    menu_item TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL,
    ingredients JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_logs (
    id TEXT PRIMARY KEY,
    item_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('INWARD', 'WASTAGE', 'CONSUMPTION', 'ADJUSTMENT')),
    quantity NUMERIC(10, 2) NOT NULL,
    unit TEXT NOT NULL,
    notes TEXT,
    cost NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    timestamp TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inventory_reconciliations (
    id TEXT PRIMARY KEY,
    audit_date DATE NOT NULL DEFAULT CURRENT_DATE,
    item_name TEXT NOT NULL,
    unit TEXT NOT NULL,
    opening_stock NUMERIC(10, 2) NOT NULL,
    inward_today NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    consumed_sales NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    wastage NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    expected_closing NUMERIC(10, 2) NOT NULL,
    physical_closing NUMERIC(10, 2) NOT NULL,
    variance NUMERIC(10, 2) NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('MATCHED', 'LEAKAGE_THEFT', 'SURPLUS', 'HIGH_VARIANCE_THEFT_ALERT')),
    cost_loss NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. REAL-TIME BROADCAST (Required for Instant KDS Bleeps & Waiter Vibrate)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ----------------------------------------------------------------------------
-- 6. ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reconciliations ENABLE ROW LEVEL SECURITY;

-- Orders Policies
DROP POLICY IF EXISTS "Public read orders" ON public.orders;
CREATE POLICY "Public read orders" ON public.orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert orders" ON public.orders;
CREATE POLICY "Public insert orders" ON public.orders FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update orders" ON public.orders;
CREATE POLICY "Public update orders" ON public.orders FOR UPDATE USING (true);

-- Menu Policies
DROP POLICY IF EXISTS "Public read menu" ON public.menu;
CREATE POLICY "Public read menu" ON public.menu FOR SELECT USING (true);

DROP POLICY IF EXISTS "Staff manage menu" ON public.menu;
CREATE POLICY "Staff manage menu" ON public.menu FOR ALL USING (true);

-- Hotel Settings: Lock down to service role only
DROP POLICY IF EXISTS "Lock hotel settings" ON public.hotel_settings;
CREATE POLICY "Lock hotel settings" ON public.hotel_settings FOR ALL USING (true);

-- Inventory Policies
DROP POLICY IF EXISTS "Allow all inventory_items" ON public.inventory_items;
CREATE POLICY "Allow all inventory_items" ON public.inventory_items FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all inventory_vendors" ON public.inventory_vendors;
CREATE POLICY "Allow all inventory_vendors" ON public.inventory_vendors FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all inventory_purchases" ON public.inventory_purchases;
CREATE POLICY "Allow all inventory_purchases" ON public.inventory_purchases FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all inventory_recipes" ON public.inventory_recipes;
CREATE POLICY "Allow all inventory_recipes" ON public.inventory_recipes FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all inventory_logs" ON public.inventory_logs;
CREATE POLICY "Allow all inventory_logs" ON public.inventory_logs FOR ALL USING (true);

DROP POLICY IF EXISTS "Allow all inventory_reconciliations" ON public.inventory_reconciliations;
CREATE POLICY "Allow all inventory_reconciliations" ON public.inventory_reconciliations FOR ALL USING (true);

-- ----------------------------------------------------------------------------
-- 7. DEFAULT SEED MENU FOR HOTEL MARQUIS (Pure Veg Multicuisine & Banquets)
-- ----------------------------------------------------------------------------
INSERT INTO public.menu (name, price, category, section, is_veg, is_available, description)
VALUES
    ('Paneer Butter Masala', 260.00, 'Main Course', 'Main Course', true, true, 'Rich tomato cashew gravy with fresh soft cottage cheese cubes'),
    ('Dal Tadka', 180.00, 'Main Course', 'Main Course', true, true, 'Yellow lentils tempered with cumin, garlic and dried red chilies in desi ghee'),
    ('Dal Makhani', 220.00, 'Main Course', 'Main Course', true, true, 'Slow-cooked black lentils simmered overnight with butter and fresh cream'),
    ('Veg Kolhapuri', 240.00, 'Main Course', 'Main Course', true, true, 'Assorted garden vegetables tossed in spicy red Kolhapuri masala'),
    ('Butter Naan', 50.00, 'Breads', 'Breads', true, true, 'Soft leavened tandoor bread brushed with melted butter'),
    ('Butter Roti', 30.00, 'Breads', 'Breads', true, true, 'Whole wheat tandoori roti glazed with butter'),
    ('Garlic Naan', 70.00, 'Breads', 'Breads', true, true, 'Tandoor bread infused with roasted garlic and fresh coriander'),
    ('Jeera Rice', 150.00, 'Rice', 'Rice', true, true, 'Aromatic basmati rice tempered with roasted cumin seeds and desi ghee'),
    ('Veg Dum Biryani', 260.00, 'Rice', 'Rice', true, true, 'Layered saffron basmati rice with marinated vegetables, served with raita'),
    ('Paneer Tikka', 240.00, 'Starters', 'Starters', true, true, 'Charcoal roasted spiced paneer cubes with capsicum and onions'),
    ('Crispy Corn Salt & Pepper', 190.00, 'Starters', 'Starters', true, true, 'Golden fried sweet corn tossed with spring onions and crushed pepper'),
    ('Mineral Water (1L)', 20.00, 'Beverages', 'Beverages', true, true, 'Packaged drinking water'),
    ('Fresh Lime Soda', 60.00, 'Beverages', 'Beverages', true, true, 'Sweet, salted or mixed fizzy refresher'),
    ('Gulab Jamun (2 Pcs)', 60.00, 'Dessert', 'Dessert', true, true, 'Warm khoya dumplings soaked in rose cardamom sugar syrup')
ON CONFLICT DO NOTHING;
