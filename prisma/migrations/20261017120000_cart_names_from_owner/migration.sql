-- Carts are named after their owner ("Navod Caldera's cart"): rename the ones made before that rule.
UPDATE "GroupCart" AS c
SET "name" = u."name" || '''s cart'
FROM "User" AS u
WHERE u."id" = c."ownerId";
