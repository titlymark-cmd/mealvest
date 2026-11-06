-- 053: control whether vote counts are publicly visible
INSERT INTO platform_settings (key, value)
VALUES ('votes_public', 'true')
ON CONFLICT (key) DO NOTHING;
