-- 022: hotel partner registration — business details, contact person,
-- application status, payment verification workflow
--
-- application_status is DELIBERATELY separate from the existing
-- `status` column: `status` (active/suspended/pending_verification/
-- expired) is the OPERATIONAL state that gates whether the hotel can
-- currently accept orders (checked in orderService.redeemOrderByQr),
-- while application_status tracks the REGISTRATION workflow itself.
-- A hotel can be application_status='approved' AND status='suspended'
-- simultaneously (approved once, later suspended for a violation) —
-- collapsing these into one column would make that state
-- unrepresentable.
ALTER TABLE hotels
  ADD COLUMN closing_hours                  TEXT,
  ADD COLUMN application_id                 TEXT UNIQUE,
  ADD COLUMN business_type                  TEXT CHECK (business_type IN
                                               ('hotel','restaurant','cafeteria','canteen','food_kiosk','cafe','catering','other')),
  ADD COLUMN business_registration_number   TEXT,
  ADD COLUMN kra_pin                        TEXT,
  ADD COLUMN county                         TEXT,
  ADD COLUMN town                           TEXT,
  ADD COLUMN landmark                       TEXT,
  ADD COLUMN whatsapp_number                TEXT,
  ADD COLUMN days_open                      TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN branches_count                 INTEGER,
  ADD COLUMN employees_count                INTEGER,
  -- Contact person — separate from the login credentials (which
  -- authenticate a specific USER) and from owner_contact_name
  -- (migration 019, kept for backward compatibility with
  -- admin.createHotel) — this is the fuller contact record the spec
  -- asks for, including sensitive ID info that must never be
  -- returned by the public hotel-browsing endpoints.
  ADD COLUMN contact_position               TEXT CHECK (contact_position IN ('owner','manager','director','authorized_representative')),
  ADD COLUMN contact_id_number              TEXT,
  ADD COLUMN preferred_contact_method       TEXT CHECK (preferred_contact_method IN ('sms','whatsapp','email')),
  -- Registration workflow state, independent of operational `status`.
  ADD COLUMN application_status             TEXT NOT NULL DEFAULT 'draft'
                                               CHECK (application_status IN ('draft','submitted','under_review','approved','rejected','suspended')),
  ADD COLUMN application_submitted_at       TIMESTAMPTZ,
  ADD COLUMN application_reviewed_at        TIMESTAMPTZ,
  ADD COLUMN application_reviewed_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN rejection_reason               TEXT,
  -- Payment/settlement verification — separate lifecycle from the
  -- application itself, since a hotel can be approved to operate
  -- while its settlement details are still pending verification
  -- (existing orders can still be tracked; payouts simply wait).
  ADD COLUMN payment_verification_status    TEXT NOT NULL DEFAULT 'pending'
                                               CHECK (payment_verification_status IN ('pending','verified','rejected','requires_correction')),
  ADD COLUMN payment_verification_reason    TEXT,
  ADD COLUMN payment_verified_at            TIMESTAMPTZ,
  ADD COLUMN payment_verified_by            UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN settlement_schedule            TEXT,
  ADD COLUMN commercial_plan_id             UUID; -- FK added after hotel_commercial_plans exists below

CREATE INDEX idx_hotels_application_status ON hotels (application_status);
CREATE INDEX idx_hotels_payment_verification_status ON hotels (payment_verification_status);

-- Human-readable application reference shown to the hotel after
-- submission (e.g. "MV-HTL-000123") — a sequence rather than reusing
-- the UUID, since the spec explicitly wants a shown "Application ID"
-- distinct from the internal primary key.
CREATE SEQUENCE hotel_application_seq START 1000;

-- -----------------------------------------------------------------
-- Commercial plans — admin-configurable, shown to a hotel BEFORE it
-- commits to paying anything (spec section 7: "do not force the
-- hotel to pay before understanding the plan").
-- -----------------------------------------------------------------
CREATE TABLE hotel_commercial_plans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL UNIQUE,
  onboarding_fee        NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (onboarding_fee >= 0 AND onboarding_fee <= 10000),
  commission_percent    NUMERIC(5, 2) NOT NULL CHECK (commission_percent >= 0 AND commission_percent <= 10),
  settlement_schedule   TEXT NOT NULL DEFAULT 'Daily at 12:00 PM',
  benefits_description  TEXT,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_hotel_commercial_plans_updated_at
  BEFORE UPDATE ON hotel_commercial_plans
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE hotels
  ADD CONSTRAINT fk_hotels_commercial_plan FOREIGN KEY (commercial_plan_id)
    REFERENCES hotel_commercial_plans(id) ON DELETE SET NULL;

INSERT INTO hotel_commercial_plans (name, onboarding_fee, commission_percent, settlement_schedule, benefits_description) VALUES
  ('Starter',  500,   10, 'Daily at 12:00 PM', 'Best for small kiosks and canteens just getting started with Mealvest.'),
  ('Standard', 3000,  8,  'Daily at 12:00 PM', 'For established restaurants with steady student traffic.'),
  ('Premium',  10000, 5,  'Daily at 12:00 PM', 'Lowest commission rate, priority placement in student hotel search.');

-- -----------------------------------------------------------------
-- Documents — metadata only for the MVP (no file storage
-- infrastructure/credentials available in this environment); stores
-- a reference (e.g. an already-hosted URL the hotel pastes in, or a
-- future file-storage key once that's configured) rather than binary
-- content. Required document types are admin-configurable, per spec
-- section 6, via hotel_document_requirements rather than hard-coded.
-- -----------------------------------------------------------------
CREATE TABLE hotel_document_requirements (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type  TEXT NOT NULL UNIQUE,
  label          TEXT NOT NULL,
  required       BOOLEAN NOT NULL DEFAULT FALSE,
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO hotel_document_requirements (document_type, label, required) VALUES
  ('business_registration_certificate', 'Business Registration Certificate', FALSE),
  ('kra_pin_certificate', 'KRA PIN Certificate', FALSE),
  ('owner_identification', 'Owner/Authorized Representative ID', TRUE),
  ('food_business_permit', 'Food/Business Permit', FALSE);

CREATE TABLE hotel_documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id         UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  document_type    TEXT NOT NULL,
  file_reference   TEXT NOT NULL, -- URL/key — see note above on why no binary storage yet
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'received', 'verified', 'rejected')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotel_documents_hotel_id ON hotel_documents (hotel_id);

CREATE TRIGGER trg_hotel_documents_updated_at
  BEFORE UPDATE ON hotel_documents
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- -----------------------------------------------------------------
-- Audit trail for settlement/payment detail changes — spec section
-- 11 explicitly requires this and requires re-verification whenever
-- details change (enforced in hotelApplicationService.updatePaymentDetails,
-- which always resets payment_verification_status back to 'pending'
-- on any change).
-- -----------------------------------------------------------------
CREATE TABLE hotel_payment_detail_changes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id       UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  changed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
  old_payment_method   TEXT,
  old_payment_details  JSONB,
  new_payment_method   TEXT NOT NULL,
  new_payment_details  JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hotel_payment_detail_changes_hotel_id ON hotel_payment_detail_changes (hotel_id);
