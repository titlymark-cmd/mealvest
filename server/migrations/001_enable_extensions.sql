-- 001: extensions
-- pgcrypto gives us gen_random_uuid() for UUID primary keys without
-- needing the older uuid-ossp extension.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
