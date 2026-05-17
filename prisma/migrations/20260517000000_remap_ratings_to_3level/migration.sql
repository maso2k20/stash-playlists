-- Data migration: remap 1-5 star ratings to 3-level system
-- 1-2 stars → 1 (Dislike), 3 stars → null (Neutral), 4 stars → 2 (Like), 5 stars → 3 (Love)
UPDATE "Item" SET "rating" =
  CASE
    WHEN "rating" IN (1, 2) THEN 1
    WHEN "rating" = 3       THEN NULL
    WHEN "rating" = 4       THEN 2
    WHEN "rating" = 5       THEN 3
    ELSE "rating"
  END
WHERE "rating" IS NOT NULL;
