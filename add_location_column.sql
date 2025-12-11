ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id INT NULL AFTER slug;

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id);

ALTER TABLE categories
  ADD CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id)
  REFERENCES categories(id)
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS product_inventory (
  id INT NOT NULL AUTO_INCREMENT,
  product_id INT NOT NULL,
  store_id INT NOT NULL,
  quantity_on_hand INT UNSIGNED NOT NULL DEFAULT 0,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  last_synced_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_product_store (product_id, store_id),
  KEY idx_inventory_store (store_id),
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_inventory_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO product_inventory (product_id, store_id, quantity_on_hand, unit_price, last_synced_at)
SELECT p.id, s.id, p.quantity_on_hand, p.unit_price, NOW()
FROM products p
JOIN stores s ON s.name = p.location
ON DUPLICATE KEY UPDATE
  quantity_on_hand = VALUES(quantity_on_hand),
  unit_price = VALUES(unit_price),
  last_synced_at = NOW();

ALTER TABLE products DROP COLUMN IF EXISTS quantity_on_hand;
ALTER TABLE products DROP COLUMN IF EXISTS location;
