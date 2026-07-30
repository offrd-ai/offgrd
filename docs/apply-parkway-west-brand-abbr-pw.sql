-- Parkway West crest abbr: PA → PW (offgrd.teams.brand)
-- Run before gameday v150 brand verification so served abbr matches crest expectation.
-- Team id from prod logos path: f7f14dc9-642f-469c-a896-0706f6631c9e

BEGIN;

UPDATE offgrd.teams
SET brand = jsonb_set(
  COALESCE(brand, '{}'::jsonb),
  '{abbr}',
  '"PW"'::jsonb,
  true
)
WHERE id = 'f7f14dc9-642f-469c-a896-0706f6631c9e'
  AND COALESCE(brand->>'abbr', '') <> 'PW';

-- Expect abbr PW; bg should already be Columbia Blue (#71bbf4 or equivalent)
SELECT id, name, brand->>'abbr' AS abbr, brand->>'bg' AS bg, brand->>'fg' AS fg
FROM offgrd.teams
WHERE id = 'f7f14dc9-642f-469c-a896-0706f6631c9e';

COMMIT;
