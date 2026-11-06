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
