-- VN metadata from libphonenumber-js 1.13.15 / metadata.max.
-- Run npm run auth:phones:audit on the intended DB before deploying.
-- A bounded write lock prevents registrations between collision check and update.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;

CREATE FUNCTION pg_temp.normalize_auth_phone(input text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  WITH trimmed AS (SELECT regexp_replace(input, '^\s+|\s+$', '', 'g') AS phone),
  national AS (
    SELECT CASE WHEN phone ~ '^0[0-9]+$' THEN substring(phone FROM 2)
                WHEN phone ~ '^\+84[0-9]+$' THEN substring(phone FROM 4)
                ELSE NULL END AS digits FROM trimmed
  )
  SELECT CASE WHEN digits ~ '^(?:2(?:0[3-9]|1[0-689]|2[0-25-9]|[38][2-9]|4[2-8]|5[124-9]|6[0-39]|7[0-7]|9[0-4679])[0-9]{7}|121[0-3][0-9]{5}|(?:1[46]0|(?:3[0-9]|7[06-9])[0-9]|5(?:[1689][0-9]|2[238]|59)|8(?:[1-8][0-9]|9[6-9])|9(?:[0-8][0-9]|9[013-9]))[0-9]{6}|1800[0-9]{4,6}|12(?:0[13]|28)[0-9]{4}|1900[0-9]{4,6}|[17]99[0-9]{4}|69[0-9]{5,6}|672[0-9]{6})$' THEN '+84' || digits ELSE NULL END
  FROM national;
$$;

DO $$
DECLARE invalid_ids uuid[]; collision_ids uuid[];
BEGIN
  SELECT array_agg(id) INTO invalid_ids FROM public.users
    WHERE pg_temp.normalize_auth_phone(phone) IS NULL;
  IF invalid_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid Vietnamese phone; review user IDs: %', invalid_ids;
  END IF;
  SELECT array_agg(id) INTO collision_ids FROM public.users
    WHERE pg_temp.normalize_auth_phone(phone) IN (
      SELECT pg_temp.normalize_auth_phone(phone) FROM public.users
      GROUP BY pg_temp.normalize_auth_phone(phone) HAVING count(*) > 1
    );
  IF collision_ids IS NOT NULL THEN
    RAISE EXCEPTION 'Phone normalization collision; review user IDs: %', collision_ids;
  END IF;
END;
$$;

UPDATE public.users SET phone = pg_temp.normalize_auth_phone(phone)
WHERE phone IS DISTINCT FROM pg_temp.normalize_auth_phone(phone);
DROP FUNCTION pg_temp.normalize_auth_phone(text);
COMMIT;
