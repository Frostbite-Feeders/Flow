-- Frostbite Feeders Inventory Database Schema
-- Run this in Supabase SQL Editor to set up your database
-- Updated: Breeder retirement flow for Large/Jumbo SKUs

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- MODULES TABLE
-- =====================================================
CREATE TABLE modules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('active', 'pending', 'offline')),
    bin_capacity INTEGER DEFAULT 42,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial modules (6 for full build)
INSERT INTO modules (id, name, status, bin_capacity) VALUES
    (1, 'Module 1', 'active', 42),
    (2, 'Module 2', 'pending', 42),
    (3, 'Module 3', 'pending', 42),
    (4, 'Module 4', 'pending', 42),
    (5, 'Module 5', 'pending', 42),
    (6, 'Module 6', 'pending', 42);

-- =====================================================
-- SKUS TABLE
-- =====================================================
-- Note: Large and Jumbo come from breeder retirement, not growth
CREATE TABLE skus (
    id VARCHAR(20) PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    weight_min_g INTEGER,
    weight_max_g INTEGER,
    weight_display VARCHAR(20),
    sales_pct DECIMAL(4,3) NOT NULL,
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('growth', 'breeder_retirement')),
    sort_order INTEGER NOT NULL
);

INSERT INTO skus (id, name, weight_min_g, weight_max_g, weight_display, sales_pct, source_type, sort_order) VALUES
    ('pinky', 'Pinky', 1, 13, '1-13g', 0.020, 'growth', 1),
    ('fuzzy', 'Fuzzy', 14, 20, '14-20g', 0.150, 'growth', 2),
    ('pup', 'Pup', 20, 30, '20-30g', 0.210, 'growth', 3),
    ('weaned', 'Weaned', 31, 45, '31-45g', 0.150, 'growth', 4),
    ('small', 'Small', 46, 80, '46-80g', 0.200, 'growth', 5),
    ('smedium', 'Small/Medium', 80, 120, '80-120g', 0.150, 'growth', 6),
    ('medium', 'Medium', 120, 175, '120-175g', 0.100, 'growth', 7),
    ('large', 'Large', 175, 300, '175-300g', 0.020, 'breeder_retirement', 8),
    ('jumbo', 'Jumbo', 300, 999, '300g+', 0.010, 'breeder_retirement', 9);

-- =====================================================
-- BREEDERS TABLE (Colony Management)
-- =====================================================
-- Tracks active breeding stock separately from litter bins
CREATE TABLE breeders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code VARCHAR(50) UNIQUE NOT NULL, -- Format: FF-BREEDER-M1-F042 (F=female, M=male)
    module_id INTEGER REFERENCES modules(id),
    sex VARCHAR(10) NOT NULL CHECK (sex IN ('female', 'male')),
    bin_number VARCHAR(20),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'retired', 'deceased')),
    pair_date DATE, -- When paired for breeding
    litter_count INTEGER DEFAULT 0, -- Number of litters produced
    retirement_sku VARCHAR(20) REFERENCES skus(id), -- 'large' for males, 'jumbo' for females
    created_at TIMESTAMPTZ DEFAULT NOW(),
    retired_at TIMESTAMPTZ,
    notes TEXT
);

-- Males retire at ~3 months → Large
-- Females retire at ~6 months → Jumbo
-- This is optimal for genetic line quality

CREATE INDEX idx_breeders_qr ON breeders(qr_code);
CREATE INDEX idx_breeders_module ON breeders(module_id);
CREATE INDEX idx_breeders_status ON breeders(status);
CREATE INDEX idx_breeders_sex ON breeders(sex);

-- =====================================================
-- BREEDING BINS TABLE (Litter Tracking)
-- =====================================================
CREATE TABLE breeding_bins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code VARCHAR(50) UNIQUE NOT NULL, -- Format: FF-BIN-M1-042
    module_id INTEGER REFERENCES modules(id),
    bin_number VARCHAR(20) NOT NULL,
    breeder_id UUID REFERENCES breeders(id), -- Links to mother
    status VARCHAR(20) DEFAULT 'empty' CHECK (status IN ('empty', 'active', 'ready_harvest', 'harvested')),
    current_count INTEGER DEFAULT 0,
    initial_count INTEGER, -- Count at birth
    birth_date TIMESTAMPTZ,
    target_sku VARCHAR(20) REFERENCES skus(id), -- Expected harvest size based on age
    expected_harvest_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bins_qr_code ON breeding_bins(qr_code);
CREATE INDEX idx_bins_module ON breeding_bins(module_id);
CREATE INDEX idx_bins_status ON breeding_bins(status);

-- =====================================================
-- MORTALITY LOG TABLE
-- =====================================================
CREATE TABLE mortality_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bin_id UUID REFERENCES breeding_bins(id) ON DELETE CASCADE,
    count INTEGER NOT NULL,
    reason VARCHAR(50) CHECK (reason IN ('maternal', 'stillborn', 'runt', 'illness', 'other')),
    notes TEXT,
    logged_at TIMESTAMPTZ DEFAULT NOW(),
    logged_by VARCHAR(100)
);

CREATE INDEX idx_mortality_bin ON mortality_log(bin_id);
CREATE INDEX idx_mortality_date ON mortality_log(logged_at);

-- =====================================================
-- HARVEST BATCHES TABLE
-- =====================================================
CREATE TABLE harvest_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_code VARCHAR(20) UNIQUE NOT NULL, -- Format: 2024-0001
    source_bin_id UUID REFERENCES breeding_bins(id),
    source_module_id INTEGER REFERENCES modules(id),
    total_count INTEGER NOT NULL,
    graded BOOLEAN DEFAULT FALSE,
    harvest_date TIMESTAMPTZ DEFAULT NOW(),
    graded_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_batches_code ON harvest_batches(batch_code);
CREATE INDEX idx_batches_graded ON harvest_batches(graded);

-- =====================================================
-- BATCH GRADING TABLE
-- =====================================================
-- Only includes growth SKUs (Pinky through Medium)
CREATE TABLE batch_grading (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_id UUID REFERENCES harvest_batches(id) ON DELETE CASCADE,
    sku_id VARCHAR(20) REFERENCES skus(id),
    count INTEGER NOT NULL,
    graded_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT growth_sku_only CHECK (sku_id NOT IN ('large', 'jumbo'))
);

CREATE INDEX idx_grading_batch ON batch_grading(batch_id);

-- =====================================================
-- BREEDER RETIREMENT LOG
-- =====================================================
-- Tracks when breeders are retired and processed into Large/Jumbo
CREATE TABLE breeder_retirements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    breeder_id UUID REFERENCES breeders(id),
    module_id INTEGER REFERENCES modules(id),
    sex VARCHAR(10) NOT NULL,
    sku_id VARCHAR(20) REFERENCES skus(id), -- 'large' or 'jumbo'
    count INTEGER NOT NULL DEFAULT 1,
    retired_at TIMESTAMPTZ DEFAULT NOW(),
    retired_by VARCHAR(100),
    CONSTRAINT retirement_sku_only CHECK (sku_id IN ('large', 'jumbo'))
);

CREATE INDEX idx_retirements_date ON breeder_retirements(retired_at);
CREATE INDEX idx_retirements_sku ON breeder_retirements(sku_id);

-- =====================================================
-- FROZEN INVENTORY TABLE
-- =====================================================
CREATE TABLE frozen_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    qr_code VARCHAR(50) UNIQUE, -- Format: FF-FROZEN-small-LOC01
    sku_id VARCHAR(20) REFERENCES skus(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    storage_location VARCHAR(100),
    freeze_date DATE DEFAULT CURRENT_DATE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_frozen_sku ON frozen_inventory(sku_id);
CREATE INDEX idx_frozen_qr ON frozen_inventory(qr_code);

-- =====================================================
-- INVENTORY ADJUSTMENTS LOG
-- =====================================================
CREATE TABLE inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sku_id VARCHAR(20) REFERENCES skus(id),
    adjustment_type VARCHAR(20) CHECK (adjustment_type IN ('pull', 'recount', 'grading_add', 'retirement_add', 'loss', 'order_fulfill')),
    quantity_before INTEGER NOT NULL,
    quantity_after INTEGER NOT NULL,
    quantity_delta INTEGER NOT NULL,
    reason TEXT,
    source_batch_id UUID REFERENCES harvest_batches(id),
    source_retirement_id UUID REFERENCES breeder_retirements(id),
    order_id VARCHAR(50),
    adjusted_at TIMESTAMPTZ DEFAULT NOW(),
    adjusted_by VARCHAR(100)
);

CREATE INDEX idx_adjustments_sku ON inventory_adjustments(sku_id);
CREATE INDEX idx_adjustments_date ON inventory_adjustments(adjusted_at);
CREATE INDEX idx_adjustments_type ON inventory_adjustments(adjustment_type);

-- =====================================================
-- ACTIVITY LOG TABLE
-- =====================================================
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    entity_type VARCHAR(50),
    entity_id VARCHAR(100),
    metadata JSONB,
    logged_at TIMESTAMPTZ DEFAULT NOW(),
    logged_by VARCHAR(100)
);

CREATE INDEX idx_activity_type ON activity_log(activity_type);
CREATE INDEX idx_activity_date ON activity_log(logged_at);

-- =====================================================
-- PHOTO ATTACHMENTS TABLE
-- =====================================================
CREATE TABLE photo_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    storage_path TEXT NOT NULL,
    captured_at TIMESTAMPTZ DEFAULT NOW(),
    captured_by VARCHAR(100)
);

CREATE INDEX idx_photos_entity ON photo_attachments(entity_type, entity_id);

-- =====================================================
-- VIEWS
-- =====================================================

-- Breeder colony summary by module
CREATE VIEW v_breeder_colony AS
SELECT 
    m.id as module_id,
    m.name as module_name,
    COUNT(b.id) FILTER (WHERE b.status = 'active' AND b.sex = 'female') as active_females,
    COUNT(b.id) FILTER (WHERE b.status = 'active' AND b.sex = 'male') as active_males,
    COUNT(b.id) FILTER (WHERE b.status = 'active') as total_active
FROM modules m
LEFT JOIN breeders b ON b.module_id = m.id
GROUP BY m.id, m.name
ORDER BY m.id;

-- Live litter inventory by module
CREATE VIEW v_live_inventory_by_module AS
SELECT 
    m.id as module_id,
    m.name as module_name,
    COUNT(b.id) FILTER (WHERE b.status = 'active') as active_litters,
    COALESCE(SUM(b.current_count) FILTER (WHERE b.status = 'active'), 0) as total_live_count,
    COUNT(b.id) FILTER (WHERE b.status = 'ready_harvest') as ready_to_harvest
FROM modules m
LEFT JOIN breeding_bins b ON b.module_id = m.id
GROUP BY m.id, m.name
ORDER BY m.id;

-- Frozen inventory with days of supply
-- Assumes Phase 1 = ~4,000 rats/week production
CREATE VIEW v_frozen_inventory_summary AS
SELECT 
    s.id as sku_id,
    s.name as sku_name,
    s.weight_display,
    s.sales_pct,
    s.source_type,
    COALESCE(SUM(f.quantity), 0) as total_quantity,
    CASE 
        WHEN s.sales_pct > 0 THEN 
            ROUND((COALESCE(SUM(f.quantity), 0) / (4000.0 * s.sales_pct)) * 7, 1)
        ELSE 0 
    END as days_of_supply
FROM skus s
LEFT JOIN frozen_inventory f ON f.sku_id = s.id
GROUP BY s.id, s.name, s.weight_display, s.sales_pct, s.source_type, s.sort_order
ORDER BY s.sort_order;

-- Breeder retirement pipeline
-- Shows breeders approaching retirement age
CREATE VIEW v_retirement_pipeline AS
SELECT 
    b.id,
    b.qr_code,
    b.module_id,
    m.name as module_name,
    b.sex,
    b.pair_date,
    b.litter_count,
    CASE 
        WHEN b.sex = 'male' THEN 'large'
        WHEN b.sex = 'female' THEN 'jumbo'
    END as retirement_sku,
    CASE 
        WHEN b.sex = 'male' THEN b.pair_date + INTERVAL '3 months'
        WHEN b.sex = 'female' THEN b.pair_date + INTERVAL '6 months'
    END as expected_retirement_date,
    CASE 
        WHEN b.sex = 'male' AND b.pair_date + INTERVAL '3 months' <= CURRENT_DATE THEN true
        WHEN b.sex = 'female' AND b.pair_date + INTERVAL '6 months' <= CURRENT_DATE THEN true
        ELSE false
    END as ready_for_retirement
FROM breeders b
JOIN modules m ON m.id = b.module_id
WHERE b.status = 'active'
ORDER BY expected_retirement_date;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Generate next batch code
CREATE OR REPLACE FUNCTION generate_batch_code()
RETURNS VARCHAR(20) AS $$
DECLARE
    year_str VARCHAR(4);
    next_num INTEGER;
BEGIN
    year_str := EXTRACT(YEAR FROM NOW())::VARCHAR;
    
    SELECT COALESCE(MAX(CAST(SPLIT_PART(batch_code, '-', 2) AS INTEGER)), 0) + 1
    INTO next_num
    FROM harvest_batches
    WHERE batch_code LIKE year_str || '-%';
    
    RETURN year_str || '-' || LPAD(next_num::VARCHAR, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Retire breeder and add to frozen inventory
CREATE OR REPLACE FUNCTION retire_breeder(
    p_breeder_id UUID,
    p_retired_by VARCHAR DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_breeder RECORD;
    v_sku_id VARCHAR(20);
    v_retirement_id UUID;
    v_current_qty INTEGER;
BEGIN
    -- Get breeder info
    SELECT * INTO v_breeder FROM breeders WHERE id = p_breeder_id AND status = 'active';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Breeder not found or not active';
    END IF;
    
    -- Determine SKU based on sex
    v_sku_id := CASE WHEN v_breeder.sex = 'male' THEN 'large' ELSE 'jumbo' END;
    
    -- Update breeder status
    UPDATE breeders 
    SET status = 'retired', 
        retired_at = NOW(),
        retirement_sku = v_sku_id
    WHERE id = p_breeder_id;
    
    -- Log retirement
    INSERT INTO breeder_retirements (breeder_id, module_id, sex, sku_id, count, retired_by)
    VALUES (p_breeder_id, v_breeder.module_id, v_breeder.sex, v_sku_id, 1, p_retired_by)
    RETURNING id INTO v_retirement_id;
    
    -- Get current frozen inventory
    SELECT COALESCE(SUM(quantity), 0) INTO v_current_qty
    FROM frozen_inventory WHERE sku_id = v_sku_id;
    
    -- Update frozen inventory
    INSERT INTO frozen_inventory (sku_id, quantity, freeze_date)
    VALUES (v_sku_id, 1, CURRENT_DATE)
    ON CONFLICT (sku_id, storage_location) 
    DO UPDATE SET quantity = frozen_inventory.quantity + 1, updated_at = NOW();
    
    -- Log adjustment
    INSERT INTO inventory_adjustments (
        sku_id, adjustment_type, quantity_before, quantity_after, quantity_delta,
        source_retirement_id, adjusted_by
    )
    VALUES (
        v_sku_id, 'retirement_add', v_current_qty, v_current_qty + 1, 1,
        v_retirement_id, p_retired_by
    );
    
    -- Activity log
    INSERT INTO activity_log (activity_type, message, entity_type, entity_id)
    VALUES (
        'breeder_retirement',
        'Retired ' || v_breeder.sex || ' breeder → ' || UPPER(v_sku_id),
        'breeder',
        p_breeder_id::VARCHAR
    );
    
    RETURN v_retirement_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (Optional - enable if multi-user)
-- =====================================================
-- ALTER TABLE breeding_bins ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE breeders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE frozen_inventory ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_bins_updated_at
    BEFORE UPDATE ON breeding_bins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_frozen_updated_at
    BEFORE UPDATE ON frozen_inventory
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tr_modules_updated_at
    BEFORE UPDATE ON modules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
