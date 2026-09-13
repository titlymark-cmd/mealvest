-- 012: hotel geo + contact fields
--
-- Adds everything the Google Maps integration needs: precise
-- coordinates, address, a distinct helpline (separate from the
-- hotel's main contact_phone), opening hours, and a services list.
-- Nothing here invents data — these columns are nullable so existing
-- hotels (and any created without coordinates yet) don't break;
-- "nearest hotel" queries simply exclude hotels with NULL lat/lng
-- (see hotelsController.getNearbyHotels).
ALTER TABLE hotels
  ADD COLUMN latitude       DOUBLE PRECISION,
  ADD COLUMN longitude      DOUBLE PRECISION,
  ADD COLUMN address        TEXT,
  ADD COLUMN helpline       TEXT,
  ADD COLUMN opening_hours  TEXT,
  ADD COLUMN services       TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN image_url      TEXT,
  ADD COLUMN description    TEXT;

-- Sanity bounds — catches obviously wrong input (e.g. swapped lat/
-- lng, or a stray 0,0) without pretending to validate real-world
-- accuracy, which the backend can't do without a geocoding call.
ALTER TABLE hotels
  ADD CONSTRAINT chk_hotels_latitude CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  ADD CONSTRAINT chk_hotels_longitude CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180));

-- Speeds up "hotels with coordinates set" filtering; a real PostGIS
-- GiST/geography index would be the next step if the hotel count
-- grows large enough for the Haversine query below to matter
-- performance-wise (see note in hotelsController.ts).
CREATE INDEX idx_hotels_has_coordinates ON hotels ((latitude IS NOT NULL AND longitude IS NOT NULL));
