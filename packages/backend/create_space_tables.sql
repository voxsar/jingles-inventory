-- Create areas table
CREATE TABLE IF NOT EXISTS areas (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    location_id TEXT NOT NULL REFERENCES locations(id),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create shelves table
CREATE TABLE IF NOT EXISTS shelves (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    area_id TEXT NOT NULL REFERENCES areas(id),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    height DOUBLE PRECISION NOT NULL,
    width DOUBLE PRECISION NOT NULL,
    length DOUBLE PRECISION NOT NULL,
    rotation_angle DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create storage_boxes table
CREATE TABLE IF NOT EXISTS storage_boxes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    area_id TEXT REFERENCES areas(id),
    shelf_id TEXT REFERENCES shelves(id),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    height DOUBLE PRECISION NOT NULL,
    width DOUBLE PRECISION NOT NULL,
    length DOUBLE PRECISION NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create box_barcodes table
CREATE TABLE IF NOT EXISTS box_barcodes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
    box_id TEXT NOT NULL REFERENCES storage_boxes(id) ON DELETE CASCADE,
    barcode TEXT NOT NULL UNIQUE,
    barcode_type TEXT NOT NULL DEFAULT 'EAN13',
    is_default BOOLEAN NOT NULL DEFAULT false,
    label TEXT,
    created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for foreign keys
CREATE INDEX IF NOT EXISTS idx_areas_location_id ON areas(location_id);
CREATE INDEX IF NOT EXISTS idx_shelves_area_id ON shelves(area_id);
CREATE INDEX IF NOT EXISTS idx_storage_boxes_area_id ON storage_boxes(area_id);
CREATE INDEX IF NOT EXISTS idx_storage_boxes_shelf_id ON storage_boxes(shelf_id);
CREATE INDEX IF NOT EXISTS idx_box_barcodes_box_id ON box_barcodes(box_id);
