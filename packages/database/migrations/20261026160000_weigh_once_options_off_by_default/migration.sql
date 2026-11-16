-- AlterTable
ALTER TABLE "site_configs" ALTER COLUMN "allowed_workflows" SET DEFAULT ARRAY['DISPATCH', 'RECEIPT']::TEXT[];


-- "Weigh loaded once" (KNOWN_TARE) became an operator-visible option, so it must be
-- off until an administrator enables it. Only rows still holding the untouched old
-- default are changed; any deliberately customised site keeps its settings.
UPDATE "site_configs" SET "allowed_workflows" = ARRAY['DISPATCH', 'RECEIPT']::TEXT[]
  WHERE "allowed_workflows" = ARRAY['DISPATCH', 'RECEIPT', 'KNOWN_TARE']::TEXT[];
