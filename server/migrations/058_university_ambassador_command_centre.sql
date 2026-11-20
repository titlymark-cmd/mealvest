-- 058_university_ambassador_command_centre.sql
-- MealVest University Ambassador Command Centre & Operations Architecture

-- 1. Extend user roles to include university ambassadors and department team members
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'hotel_staff', 'hotel_owner', 'mealvest_admin', 'university_ambassador', 'team_member'));

-- 2. Universities table
CREATE TABLE IF NOT EXISTS universities (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL UNIQUE,
  slug                    TEXT NOT NULL UNIQUE,
  county                  TEXT,
  town                    TEXT,
  target_students         INTEGER NOT NULL DEFAULT 5000,
  is_active               BOOLEAN NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_universities_slug ON universities (slug);
CREATE INDEX IF NOT EXISTS idx_universities_active ON universities (is_active);

CREATE TRIGGER trg_universities_updated_at
  BEFORE UPDATE ON universities
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 3. Link students and hotels to universities
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_students_university_id ON students (university_id);

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS university_id UUID REFERENCES universities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hotels_university_id ON hotels (university_id);

-- 4. University Ambassadors profile
CREATE TABLE IF NOT EXISTS university_ambassadors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  phone_number    TEXT,
  email           TEXT,
  photo_url       TEXT,
  bio             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_univ_ambassadors_user_id ON university_ambassadors (user_id);

CREATE TRIGGER trg_univ_ambassadors_updated_at
  BEFORE UPDATE ON university_ambassadors
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 5. Ambassador Assignments
CREATE TABLE IF NOT EXISTS ambassador_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ambassador_id   UUID NOT NULL REFERENCES university_ambassadors(id) ON DELETE CASCADE,
  university_id   UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'transferred')),
  assigned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ambassador_assignments_uni ON ambassador_assignments (university_id, status);
CREATE INDEX IF NOT EXISTS idx_ambassador_assignments_amb ON ambassador_assignments (ambassador_id, status);

CREATE TRIGGER trg_ambassador_assignments_updated_at
  BEFORE UPDATE ON ambassador_assignments
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 6. Departments
CREATE TABLE IF NOT EXISTS departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id   UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  name            TEXT NOT NULL CHECK (name IN ('leadership', 'marketing', 'hotels', 'customer_care')),
  display_name    TEXT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (university_id, name)
);

CREATE INDEX IF NOT EXISTS idx_departments_university_id ON departments (university_id);

-- 7. Team Members
CREATE TABLE IF NOT EXISTS team_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  university_id       UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  department          TEXT NOT NULL CHECK (department IN ('leadership', 'marketing', 'hotels', 'customer_care')),
  department_id       UUID REFERENCES departments(id) ON DELETE SET NULL,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone_number        TEXT,
  photo_url           TEXT,
  role_title          TEXT NOT NULL,
  responsibilities    TEXT,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  performance_score   NUMERIC(5, 2) NOT NULL DEFAULT 85.0 CHECK (performance_score >= 0 AND performance_score <= 100),
  students_acquired   INTEGER NOT NULL DEFAULT 0,
  campaigns_handled   INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_uni_dept ON team_members (university_id, department);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members (user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members (LOWER(email));

CREATE TRIGGER trg_team_members_updated_at
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 8. Role Permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id  UUID NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  permission      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (team_member_id, permission)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_member ON role_permissions (team_member_id);

-- 9. Marketing Campaigns
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id       UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  category            TEXT NOT NULL CHECK (category IN ('whatsapp', 'tiktok', 'instagram', 'facebook', 'campus_activations', 'class_rep_outreach', 'student_referrals', 'other')),
  objective           TEXT,
  description         TEXT,
  target_audience     TEXT,
  poster_url          TEXT,
  media_urls          TEXT[] NOT NULL DEFAULT '{}',
  start_date          DATE NOT NULL,
  end_date            DATE,
  budget_kes          NUMERIC(10, 2) NOT NULL DEFAULT 0,
  spend_kes           NUMERIC(10, 2) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planning', 'active', 'paused', 'completed', 'cancelled')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_uni ON marketing_campaigns (university_id, status);

CREATE TRIGGER trg_marketing_campaigns_updated_at
  BEFORE UPDATE ON marketing_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 10. Campaign Performance Reports
CREATE TABLE IF NOT EXISTS campaign_performance (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         UUID NOT NULL REFERENCES marketing_campaigns(id) ON DELETE CASCADE,
  reported_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  student_reach       INTEGER NOT NULL DEFAULT 0,
  impressions         INTEGER NOT NULL DEFAULT 0,
  engagement          INTEGER NOT NULL DEFAULT 0,
  link_clicks         INTEGER NOT NULL DEFAULT 0,
  new_registrations   INTEGER NOT NULL DEFAULT 0,
  notes               TEXT,
  report_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_performance_cmp ON campaign_performance (campaign_id, report_date);

-- 11. Hotel Leads (Recruitment Pipeline)
CREATE TABLE IF NOT EXISTS hotel_leads (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id           UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  hotel_id                UUID REFERENCES hotels(id) ON DELETE SET NULL,
  business_name           TEXT NOT NULL,
  owner_manager_name      TEXT,
  contact_phone           TEXT,
  contact_email           TEXT,
  physical_location       TEXT,
  stage                   TEXT NOT NULL DEFAULT 'identified' CHECK (stage IN (
                            'identified', 'contacted', 'interested', 'negotiating',
                            'agreement_pending', 'onboarded', 'active', 'rejected_inactive'
                          )),
  commission_rate         NUMERIC(5, 2) NOT NULL DEFAULT 10.0,
  estimated_daily_meals   INTEGER NOT NULL DEFAULT 0,
  notes                   TEXT,
  assigned_to             UUID REFERENCES team_members(id) ON DELETE SET NULL,
  last_contact_date       TIMESTAMPTZ,
  next_followup_date      TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_leads_uni_stage ON hotel_leads (university_id, stage);

CREATE TRIGGER trg_hotel_leads_updated_at
  BEFORE UPDATE ON hotel_leads
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 12. Hotel Partnerships
CREATE TABLE IF NOT EXISTS hotel_partnerships (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id           UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  hotel_id                UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  lead_id                 UUID REFERENCES hotel_leads(id) ON DELETE SET NULL,
  partnership_status      TEXT NOT NULL DEFAULT 'active' CHECK (partnership_status IN ('active', 'suspended', 'under_review', 'terminated')),
  agreement_status        TEXT NOT NULL DEFAULT 'signed' CHECK (agreement_status IN ('draft', 'sent', 'signed', 'expired')),
  agreement_signed_at     TIMESTAMPTZ,
  custom_commission_rate  NUMERIC(5, 2) NOT NULL DEFAULT 10.0,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (university_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_hotel_partnerships_uni ON hotel_partnerships (university_id, partnership_status);

CREATE TRIGGER trg_hotel_partnerships_updated_at
  BEFORE UPDATE ON hotel_partnerships
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 13. Team Tasks
CREATE TABLE IF NOT EXISTS team_tasks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id       UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  created_by          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_to         UUID REFERENCES team_members(id) ON DELETE SET NULL,
  department          TEXT NOT NULL CHECK (department IN ('leadership', 'marketing', 'hotels', 'customer_care')),
  title               TEXT NOT NULL,
  description         TEXT,
  priority            TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status              TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'under_review', 'completed', 'overdue')),
  deadline            TIMESTAMPTZ,
  completion_evidence TEXT,
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_tasks_uni_status ON team_tasks (university_id, status);
CREATE INDEX IF NOT EXISTS idx_team_tasks_assigned ON team_tasks (assigned_to, status);

CREATE TRIGGER trg_team_tasks_updated_at
  BEFORE UPDATE ON team_tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 14. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number       TEXT NOT NULL UNIQUE,
  university_id       UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  student_user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  student_name        TEXT NOT NULL,
  student_phone       TEXT,
  category            TEXT NOT NULL CHECK (category IN (
                        'login_problems', 'payment_issues', 'meal_plan_issues',
                        'hotel_complaints', 'qr_meal_pass_issues', 'refund_or_transaction',
                        'account_issues', 'general_inquiries'
                      )),
  priority            TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'assigned', 'in_progress', 'escalated', 'resolved', 'closed')),
  assigned_to         UUID REFERENCES team_members(id) ON DELETE SET NULL,
  description         TEXT NOT NULL,
  escalated_to_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  escalation_reason   TEXT,
  resolved_at         TIMESTAMPTZ,
  csat_rating         INTEGER CHECK (csat_rating >= 1 AND csat_rating <= 5),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_uni_status ON support_tickets (university_id, status);

CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 15. Support Messages
CREATE TABLE IF NOT EXISTS support_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id           UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  sender_name         TEXT NOT NULL,
  sender_type         TEXT NOT NULL CHECK (sender_type IN ('student', 'agent', 'admin', 'system')),
  message             TEXT NOT NULL,
  is_internal_note    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages (ticket_id, created_at);

-- 16. University Announcements
CREATE TABLE IF NOT EXISTS university_announcements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type         TEXT NOT NULL CHECK (target_type IN ('central', 'university', 'team', 'operational')),
  university_id       UUID REFERENCES universities(id) ON DELETE CASCADE,
  target_department   TEXT CHECK (target_department IN ('leadership', 'marketing', 'hotels', 'customer_care', 'all')),
  title               TEXT NOT NULL,
  content             TEXT NOT NULL,
  priority            TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'important', 'urgent')),
  is_pinned           BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_univ_announcements_uni ON university_announcements (university_id, created_at DESC);

CREATE TRIGGER trg_univ_announcements_updated_at
  BEFORE UPDATE ON university_announcements
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- 17. Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id       UUID REFERENCES universities(id) ON DELETE CASCADE,
  user_id             UUID REFERENCES users(id) ON DELETE SET NULL,
  user_name           TEXT,
  department          TEXT,
  action_type         TEXT NOT NULL,
  entity_type         TEXT NOT NULL,
  entity_id           TEXT,
  details             JSONB NOT NULL DEFAULT '{}',
  ip_address          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_uni ON activity_logs (university_id, created_at DESC);

-- 18. University Reports
CREATE TABLE IF NOT EXISTS university_reports (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id       UUID NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  generated_by        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_type         TEXT NOT NULL CHECK (report_type IN (
                        'student_acquisition',
                        'university_growth',
                        'hotel_recruitment',
                        'hotel_performance',
                        'digital_marketing',
                        'customer_care',
                        'team_performance',
                        'financial_commission',
                        'monthly_performance'
                      )),
  title               TEXT NOT NULL,
  start_date          DATE NOT NULL,
  end_date            DATE NOT NULL,
  summary_data        JSONB NOT NULL DEFAULT '{}',
  submitted_to_admin  BOOLEAN NOT NULL DEFAULT FALSE,
  admin_notes         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_univ_reports_uni ON university_reports (university_id, report_type);

-- 19. Initial Universities Seed & Mapping
INSERT INTO universities (name, slug, county, town, target_students)
VALUES
  ('Maseno University', 'maseno', 'Kisumu', 'Maseno', 6000),
  ('University of Nairobi', 'uon', 'Nairobi', 'Nairobi', 15000),
  ('Kenyatta University', 'ku', 'Nairobi', 'Nairobi', 12000),
  ('Jomo Kenyatta University of Agriculture and Technology', 'jkuat', 'Kiambu', 'Juja', 10000),
  ('Strathmore University', 'strathmore', 'Nairobi', 'Madaraka', 4000),
  ('Moi University', 'moi', 'Uasin Gishu', 'Eldoret', 8000)
ON CONFLICT (name) DO NOTHING;

-- Map existing students to Maseno University if institution matches
UPDATE students
   SET university_id = (SELECT id FROM universities WHERE slug = 'maseno' LIMIT 1)
 WHERE (university_id IS NULL)
   AND (institution ILIKE '%Maseno%' OR institution IS NULL);

-- Map existing hotels to Maseno University for default testing if not set
UPDATE hotels
   SET university_id = (SELECT id FROM universities WHERE slug = 'maseno' LIMIT 1)
 WHERE university_id IS NULL;
