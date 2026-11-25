-- No legacy project is scheduled implicitly. The domain records a deadline
-- only after the complete refund transaction succeeds.
ALTER TABLE campaigns ADD CONSTRAINT campaign_retention_metadata CHECK (
  (NOT (extra ? 'purgeAfter') OR
    (extra->>'deletedAt' IS NOT NULL AND extra->>'purgeAfter' IS NOT NULL
      AND (extra->>'purgeAfter')::timestamptz = (extra->>'deletedAt')::timestamptz + interval '720 hours'))
  AND (NOT (extra ? 'purgedAt') OR
    (extra->>'purgeAfter' IS NOT NULL AND extra->>'purgedAt' IS NOT NULL
      AND (extra->>'purgedAt')::timestamptz >= (extra->>'purgeAfter')::timestamptz))
);
-- ISO UTC strings sort in chronological order without a non-immutable cast.
CREATE INDEX campaigns_due_cleanup ON campaigns ((extra->>'purgeAfter'))
  WHERE extra ? 'purgeAfter' AND NOT (extra ? 'purgedAt');
