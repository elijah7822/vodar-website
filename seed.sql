-- Seed data: products + settings (idempotent)
INSERT OR IGNORE INTO products (id, name, description, price_amt, image, active, sort) VALUES
  ('P1', 'VODAR Band — Full Set', 'The complete VODAR wearable set: band, charging cable and sport strap.', 10000, '', 1, 1),
  ('P2', 'Charging Cable', 'Replacement USB charging cable for the VODAR band.', 1500, '', 1, 2),
  ('P3', 'Spare Strap', 'Replacement sport strap for the VODAR band.', 2000, '', 1, 3);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('notify_admin_email', '');
