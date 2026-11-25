-- Existing hidden projects keep their original moderation decision. A later
-- explicit deletion calculates and settles their outstanding contributions.
ALTER TABLE contributions DROP CONSTRAINT contributions_status_check;
ALTER TABLE contributions ADD CHECK (status IN ('pending','confirmed','failed','canceled'));
ALTER TABLE contributions
  ADD COLUMN refund_status text NOT NULL DEFAULT 'none',
  ADD COLUMN refund_id text,
  ADD COLUMN refund_batch_id text,
  ADD COLUMN refunded_at timestamptz,
  ADD COLUMN refunded_by text,
  ADD COLUMN refund_reason text,
  ADD CONSTRAINT contribution_refund_actor_fk FOREIGN KEY (workspace_id,refunded_by) REFERENCES demo_users(workspace_id,id),
  ADD CONSTRAINT contribution_refund_id_unique UNIQUE (workspace_id,refund_id),
  ADD CONSTRAINT contribution_refund_complete CHECK (
    (refund_status='none' AND refund_id IS NULL AND refund_batch_id IS NULL AND refunded_at IS NULL AND refunded_by IS NULL AND refund_reason IS NULL)
    OR (refund_status='completed' AND status='confirmed' AND confirmed_at IS NOT NULL
      AND refund_id IS NOT NULL AND length(refund_id) BETWEEN 1 AND 160
      AND refund_batch_id IS NOT NULL AND length(refund_batch_id) BETWEEN 1 AND 160
      AND refunded_at IS NOT NULL AND refunded_by IS NOT NULL AND refund_reason IS NOT NULL
      AND length(refund_reason) BETWEEN 5 AND 500 AND subscription_status IS DISTINCT FROM 'active')
  ),
  ADD CONSTRAINT contribution_project_cancellation CHECK (
    status<>'canceled' OR (confirmed_at IS NULL AND subscription_status IS NULL
      AND (extra->>'cancellationReason') IS NOT DISTINCT FROM 'project_deleted'
      AND extra->>'canceledAt' IS NOT NULL)
  );

ALTER TABLE ledger_entries DROP CONSTRAINT ledger_entries_type_check;
ALTER TABLE ledger_entries ADD CHECK (type IN ('opening_balance','contribution','payout','refund'));
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_refund_links CHECK (
  type<>'refund' OR (contribution_id IS NOT NULL AND campaign_id IS NOT NULL AND payout_id IS NULL
    AND extra->>'refundId' IS NOT NULL AND extra->>'refundBatchId' IS NOT NULL)
);
