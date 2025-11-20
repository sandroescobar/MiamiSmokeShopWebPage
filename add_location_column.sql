-- Add location column to products table
ALTER TABLE products 
ADD COLUMN location VARCHAR(100) DEFAULT 'Calle 8' AFTER supplier;

-- Mark all existing products as Calle 8
UPDATE products SET location = 'Calle 8' WHERE location IS NULL;
