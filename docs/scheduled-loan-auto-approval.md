# Scheduled loan autoapproval

Deploy the migration before activating any rules. It does not enable or post
anything by itself. Existing loan manual review remains available.

The initial supported bank format is EverBank equipment-loan ACH. A service-role
administrator configures one `financial_loan_auto_rules` row per authorized loan:
`loan_id`, `practice_id`, funding `financial_account_id`, expense
`interest_account_id`, explicit `starts_on`, and `is_enabled`.
Verify all four records belong to the same practice. Do not copy IDs across tenants.
There is no settings UI for this first version; configuration is a separate,
explicit deployment operation, not an inferred opt-in from past approvals.

Before enabling, verify the lender schedule, funding account, monthly amount,
loan terms, balance anchor, and requested start date. The schedule must carry a
source document. Only verified active monthly amortizing loans qualify. Fees,
partial payments, stale schedules, ambiguous matches and changed amounts stay
in review. A unique exact installment within seven days is required; there is
no estimated or prorated automatic split.

Bank sync revisits up to 500 matching settled review rows in date order, including
already imported rows after opt-in. The transaction, loan and schedule are locked;
the existing allocation RPC writes the journal and updates the loan balance.
A unique schedule claim prevents duplicate use, and existing manually recorded
payments in the same month or within seven days block automatic posting.
Disable a rule before changing lender terms or making irregular payments.

After activation, run import, inspect the generated split and journal, then run
import again and verify no duplicate entries. This records existing bank activity;
it never initiates a lender payment. Test production configuration with known IDs
only; do not apply synthetic fixtures to a live database.

Zelle automatic category rules now use the exact outgoing recipient, not a generic
Zelle label or reference-specific fingerprint. Account/direction-scoped rules must
still be enabled. Existing review rows are not automatically replayed by that
category-rule change; inspect and approve the intended backlog separately.
