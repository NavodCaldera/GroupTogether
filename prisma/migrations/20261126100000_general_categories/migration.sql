-- Categories outside clothing (DEC-029 phase 9): Stationery, Household and Food (restricted),
-- with their attributes. No add-ons and only the general return reasons. The same rows as
-- seedCategories() in src/lib/categories.ts; tests replay the tree block.
-- tree:start
INSERT INTO "Category" ("id", "parentId", "slug", "name", "path", "sortOrder", "commissionPct", "minCommission", "features", "needsApproval", "returnReasons", "updatedAt") VALUES
  ('cat_stationery', NULL, 'stationery', 'Stationery', '/cat_stationery/', 2, 8.00, 5.00, ARRAY[]::TEXT[], false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_stationery_exercise_books', 'cat_stationery', 'stationery/exercise-books', 'Exercise books', '/cat_stationery/cat_stationery_exercise_books/', 0, NULL, NULL, ARRAY[]::TEXT[], false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_stationery_pens', 'cat_stationery', 'stationery/pens', 'Pens', '/cat_stationery/cat_stationery_pens/', 1, NULL, NULL, ARRAY[]::TEXT[], false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_household', NULL, 'household', 'Household', '/cat_household/', 3, 10.00, 10.00, ARRAY[]::TEXT[], false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_household_kitchenware', 'cat_household', 'household/kitchenware', 'Kitchenware', '/cat_household/cat_household_kitchenware/', 0, NULL, NULL, ARRAY[]::TEXT[], false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_household_cleaning', 'cat_household', 'household/cleaning', 'Cleaning', '/cat_household/cat_household_cleaning/', 1, NULL, NULL, ARRAY[]::TEXT[], false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_food', NULL, 'food', 'Food', '/cat_food/', 4, 12.00, 20.00, ARRAY[]::TEXT[], true, ARRAY[]::TEXT[], CURRENT_TIMESTAMP),
  ('cat_food_snacks', 'cat_food', 'food/snacks', 'Packaged snacks', '/cat_food/cat_food_snacks/', 0, NULL, NULL, ARRAY[]::TEXT[], false, ARRAY[]::TEXT[], CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AttributeDef" ("id", "key", "label", "type", "unit") VALUES
  ('attr_pages', 'pages', 'Pages', 'ENUM', NULL),
  ('attr_ruling', 'ruling', 'Ruling', 'ENUM', NULL),
  ('attr_ink_colour', 'ink_colour', 'Ink colour', 'ENUM', NULL),
  ('attr_pack_size', 'pack_size', 'Pens per pack', 'NUMBER', NULL),
  ('attr_material', 'material', 'Material', 'ENUM', NULL),
  ('attr_capacity_ml', 'capacity_ml', 'Capacity', 'NUMBER', 'ml'),
  ('attr_scent', 'scent', 'Scent', 'ENUM', NULL),
  ('attr_volume_ml', 'volume_ml', 'Volume', 'NUMBER', 'ml'),
  ('attr_flavour', 'flavour', 'Flavour', 'ENUM', NULL),
  ('attr_weight_g', 'weight_g', 'Weight', 'NUMBER', 'g')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "AttributeOption" ("id", "defId", "value", "label", "sortOrder") VALUES
  ('attr_pages_80', 'attr_pages', '80', '80', 0),
  ('attr_pages_120', 'attr_pages', '120', '120', 1),
  ('attr_pages_160', 'attr_pages', '160', '160', 2),
  ('attr_pages_200', 'attr_pages', '200', '200', 3),
  ('attr_ruling_single_rule', 'attr_ruling', 'Single rule', 'Single rule', 0),
  ('attr_ruling_square', 'attr_ruling', 'Square', 'Square', 1),
  ('attr_ruling_blank', 'attr_ruling', 'Blank', 'Blank', 2),
  ('attr_ink_colour_blue', 'attr_ink_colour', 'Blue', 'Blue', 0),
  ('attr_ink_colour_black', 'attr_ink_colour', 'Black', 'Black', 1),
  ('attr_ink_colour_red', 'attr_ink_colour', 'Red', 'Red', 2),
  ('attr_material_stainless_steel', 'attr_material', 'Stainless steel', 'Stainless steel', 0),
  ('attr_material_aluminium', 'attr_material', 'Aluminium', 'Aluminium', 1),
  ('attr_material_plastic', 'attr_material', 'Plastic', 'Plastic', 2),
  ('attr_material_glass', 'attr_material', 'Glass', 'Glass', 3),
  ('attr_scent_lemon', 'attr_scent', 'Lemon', 'Lemon', 0),
  ('attr_scent_lavender', 'attr_scent', 'Lavender', 'Lavender', 1),
  ('attr_scent_unscented', 'attr_scent', 'Unscented', 'Unscented', 2),
  ('attr_flavour_salted', 'attr_flavour', 'Salted', 'Salted', 0),
  ('attr_flavour_chilli', 'attr_flavour', 'Chilli', 'Chilli', 1),
  ('attr_flavour_cheese', 'attr_flavour', 'Cheese', 'Cheese', 2)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "CategoryAttribute" ("categoryId", "defId", "required", "isVariantAxis", "filterable", "sortOrder") VALUES
  ('cat_stationery_exercise_books', 'attr_pages', true, true, true, 0),
  ('cat_stationery_exercise_books', 'attr_ruling', true, true, true, 1),
  ('cat_stationery_pens', 'attr_ink_colour', true, true, true, 0),
  ('cat_stationery_pens', 'attr_pack_size', true, false, false, 1),
  ('cat_household_kitchenware', 'attr_material', true, false, true, 0),
  ('cat_household_kitchenware', 'attr_capacity_ml', false, false, false, 1),
  ('cat_household_cleaning', 'attr_scent', true, true, true, 0),
  ('cat_household_cleaning', 'attr_volume_ml', true, false, false, 1),
  ('cat_food_snacks', 'attr_flavour', true, true, true, 0),
  ('cat_food_snacks', 'attr_weight_g', true, false, false, 1)
ON CONFLICT ("categoryId", "defId") DO NOTHING;
-- tree:end
