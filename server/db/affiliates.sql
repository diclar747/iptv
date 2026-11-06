CREATE TABLE IF NOT EXISTS subscription_payments (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id BIGINT NOT NULL REFERENCES users(id), amount_gs BIGINT NOT NULL CHECK(amount_gs>0),
 duration_days INTEGER NOT NULL CHECK(duration_days>0), reference TEXT NOT NULL,
 request_key UUID NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 approved_reference TEXT, note TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 resolved_at TIMESTAMPTZ, resolved_by BIGINT REFERENCES users(id), UNIQUE(user_id,request_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payment_pending ON subscription_payments(user_id) WHERE status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payment_reference ON subscription_payments(lower(approved_reference)) WHERE status='approved';
CREATE TABLE IF NOT EXISTS affiliate_commissions (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 payment_id BIGINT NOT NULL UNIQUE REFERENCES subscription_payments(id),
 affiliate_id BIGINT NOT NULL REFERENCES users(id), referred_id BIGINT NOT NULL REFERENCES users(id),
 amount_gs BIGINT NOT NULL CHECK(amount_gs>0), state TEXT NOT NULL CHECK(state IN ('earned','lost')),
 reason TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), CHECK(affiliate_id<>referred_id)
);
CREATE INDEX IF NOT EXISTS affiliate_commission_owner ON affiliate_commissions(affiliate_id,created_at DESC);
CREATE TABLE IF NOT EXISTS affiliate_withdrawals (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id),
 amount_gs BIGINT NOT NULL CHECK(amount_gs>0), request_key UUID NOT NULL,
 bank_snapshot JSONB NOT NULL,status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','rejected')),
 payment_reference TEXT,note TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),resolved_at TIMESTAMPTZ,
 resolved_by BIGINT REFERENCES users(id),UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS affiliate_withdrawal_owner ON affiliate_withdrawals(user_id,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS affiliate_withdrawal_bank_reference ON affiliate_withdrawals(lower(payment_reference)) WHERE status='paid';
CREATE TABLE IF NOT EXISTS affiliate_ledger (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id),
 amount_gs BIGINT NOT NULL CHECK(amount_gs<>0),kind TEXT NOT NULL CHECK(kind IN ('commission','withdrawal','release')),
 commission_id BIGINT UNIQUE REFERENCES affiliate_commissions(id),withdrawal_id BIGINT REFERENCES affiliate_withdrawals(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(withdrawal_id,kind)
);
CREATE INDEX IF NOT EXISTS affiliate_ledger_owner ON affiliate_ledger(user_id,created_at DESC);

-- Account administration. Referral codes and aliases survive username edits.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS affiliate_code UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS users_affiliate_code ON users(affiliate_code);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users(lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS affiliate_user_created ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS affiliate_user_expiry ON users(expires_at);
CREATE TABLE IF NOT EXISTS affiliate_referral_aliases (
 alias TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO affiliate_referral_aliases(alias,user_id) SELECT username,id FROM users WHERE role<>'admin' ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS app_sessions (
 token_hash TEXT PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '30 days'
);
CREATE INDEX IF NOT EXISTS app_session_owner ON app_sessions(user_id);
CREATE TABLE IF NOT EXISTS affiliate_admin_audit (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id),
 actor_id BIGINT NOT NULL REFERENCES users(id),action TEXT NOT NULL,details JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_audit_owner ON affiliate_admin_audit(user_id,id DESC);
CREATE TABLE IF NOT EXISTS admin_plan_activations (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id),
 actor_id BIGINT NOT NULL REFERENCES users(id),request_key UUID NOT NULL,
 months INTEGER NOT NULL CHECK(months IN (1,2,3,6,12)),kind TEXT NOT NULL CHECK(kind IN ('paid','courtesy')),
 payment_id BIGINT UNIQUE REFERENCES subscription_payments(id),amount_gs BIGINT NOT NULL CHECK(amount_gs>=0),
 before_expiry TIMESTAMPTZ,after_expiry TIMESTAMPTZ NOT NULL,note TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(user_id,request_key)
);
CREATE TABLE IF NOT EXISTS affiliate_bank_accounts (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),user_id BIGINT NOT NULL REFERENCES users(id),label TEXT NOT NULL,
 data JSONB NOT NULL,disabled BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS affiliate_bank_owner ON affiliate_bank_accounts(user_id);
CREATE TABLE IF NOT EXISTS payment_receipts (
 id UUID PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id),payment_id BIGINT UNIQUE REFERENCES subscription_payments(id),
 filename TEXT NOT NULL,original_name TEXT NOT NULL,mime TEXT NOT NULL,size_bytes BIGINT NOT NULL CHECK(size_bytes>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipt_owner ON payment_receipts(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS billing_qr_asset (
 id INTEGER PRIMARY KEY CHECK(id=1),filename TEXT NOT NULL,bank_fingerprint TEXT NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Durable notifications are delivered directly by Node, without a third-party notifier.
CREATE TABLE IF NOT EXISTS app_notifications (
 id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id BIGINT REFERENCES users(id),kind TEXT NOT NULL,
 title TEXT NOT NULL,body TEXT NOT NULL,link TEXT NOT NULL DEFAULT '/',dedupe_key TEXT NOT NULL UNIQUE,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notification_owner ON app_notifications(user_id,id DESC);
CREATE TABLE IF NOT EXISTS app_notification_state (
 user_id BIGINT PRIMARY KEY REFERENCES users(id),last_read_id BIGINT NOT NULL DEFAULT 0,enabled BOOLEAN NOT NULL DEFAULT true
);
