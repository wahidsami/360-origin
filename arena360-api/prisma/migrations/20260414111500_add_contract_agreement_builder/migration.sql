ALTER TABLE "Contract"
ADD COLUMN IF NOT EXISTS "agreementLocale" TEXT NOT NULL DEFAULT 'ar',
ADD COLUMN IF NOT EXISTS "agreementPayloadJson" JSONB,
ADD COLUMN IF NOT EXISTS "agreementPdfFileAssetId" TEXT,
ADD COLUMN IF NOT EXISTS "agreementGeneratedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "agreementSignedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "agreementSignedById" TEXT,
ADD COLUMN IF NOT EXISTS "agreementStatus" TEXT NOT NULL DEFAULT 'DRAFT';

CREATE UNIQUE INDEX IF NOT EXISTS "Contract_agreementPdfFileAssetId_key"
ON "Contract"("agreementPdfFileAssetId");

ALTER TABLE "Contract"
ADD CONSTRAINT "Contract_agreementPdfFileAssetId_fkey"
FOREIGN KEY ("agreementPdfFileAssetId")
REFERENCES "FileAsset"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
