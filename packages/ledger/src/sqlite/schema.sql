-- Covenant persistence schema. Backend architecture section 3, verbatim.
-- `events` is the system of record; every other table is a fold.
-- Applied by Migrations inside one transaction; every statement is idempotent.

-- ---------------------------------------------------------------- 3.2 events
CREATE TABLE IF NOT EXISTS events (
  seq          INTEGER PRIMARY KEY,                     -- total order, gapless; assigned head+1 inside the txn
  id           TEXT    NOT NULL UNIQUE,                 -- uuid v4
  ts           TEXT    NOT NULL,                        -- RFC3339 UTC, millisecond precision
  ts_ms        INTEGER NOT NULL,                        -- epoch ms, for range scans without date parsing
  tenant_id    TEXT    NOT NULL,                        -- AM3: every row is tenant-scoped
  actor        TEXT    NOT NULL CHECK (actor IN
                 ('user','buyer_agent','merchant_agent','gateway','razorpay','system','attacker')),
  kind         TEXT    NOT NULL,                        -- dotted EventKind catalog (section 10.3)
  txn_id       TEXT,                                    -- causal correlation; NULL for non-txn events
  request_id   TEXT,                                    -- ACP Request-Id, threaded from the header
  mandate_id   TEXT,                                    -- jti of the mandate this event concerns
  payload_json TEXT    NOT NULL CHECK (json_valid(payload_json)),
  prev_hash    TEXT    NOT NULL CHECK (length(prev_hash) = 64),
  this_hash    TEXT    NOT NULL UNIQUE CHECK (length(this_hash) = 64)
) STRICT;

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'E_LEDGER_IMMUTABLE: events is append-only');
END;

CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'E_LEDGER_IMMUTABLE: events is append-only');
END;

-- A fork is as bad as a rewrite: refuse any insert that does not extend the current head.
CREATE TRIGGER IF NOT EXISTS events_chain_guard
BEFORE INSERT ON events
WHEN NEW.prev_hash <> COALESCE(
       (SELECT this_hash FROM events ORDER BY seq DESC LIMIT 1),
       '0000000000000000000000000000000000000000000000000000000000000000')
BEGIN
  SELECT RAISE(ABORT, 'E_LEDGER_FORK: prev_hash does not extend the ledger head');
END;

-- -------------------------------------------------------- 3.3 events indexes
CREATE INDEX IF NOT EXISTS idx_events_txn_seq    ON events(txn_id, seq) WHERE txn_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_kind_ts    ON events(kind, ts_ms);
CREATE INDEX IF NOT EXISTS idx_events_tenant_seq ON events(tenant_id, seq);
CREATE INDEX IF NOT EXISTS idx_events_mandate    ON events(mandate_id) WHERE mandate_id IS NOT NULL;

-- ---------------------------------------------------------------- 3.4 memory
CREATE TABLE IF NOT EXISTS memory (
  id             TEXT    PRIMARY KEY,                   -- mem_<uuid>
  tenant_id      TEXT    NOT NULL,
  user_id        TEXT    NOT NULL,
  type           TEXT    NOT NULL CHECK (type IN
                   ('constraint','preference','fact','episode','procedure')),
  tier           INTEGER NOT NULL CHECK (tier BETWEEN 0 AND 3),
  quarantined    INTEGER NOT NULL DEFAULT 0 CHECK (quarantined IN (0,1)),
  subject        TEXT,                                  -- sku / merchant / 'user' - the supersede key
  predicate      TEXT,                                  -- 'price' | 'stock' | 'max_amount' | 'category_cap' | ...
  content        TEXT    NOT NULL CHECK (json_valid(content)),
  content_hash   TEXT    NOT NULL CHECK (length(content_hash) = 64),
  entry_hash     TEXT    NOT NULL CHECK (length(entry_hash) = 64),   -- digest input (section 9.4)
  source_channel TEXT    NOT NULL CHECK (source_channel IN
                   ('user_signed_mandate','user_confirmation','merchant_attestation',
                    'verified_api','untrusted_text')),
  source_ref     TEXT,                                  -- mandate jti / attestation jti / url
  t_valid        TEXT    NOT NULL,                      -- world-time: true from
  t_invalid      TEXT,                                  -- world-time: true until (NULL = still true)
  t_created      TEXT    NOT NULL,                      -- system-time: we learned it
  t_expired      TEXT,                                  -- system-time: we stopped believing it
  superseded_by  TEXT    REFERENCES memory(id),
  write_event_id TEXT    NOT NULL REFERENCES events(id)
) STRICT;

CREATE TRIGGER IF NOT EXISTS memory_no_delete
BEFORE DELETE ON memory
BEGIN
  SELECT RAISE(ABORT, 'E_MEMORY_IMMUTABLE: memory is invalidated, never deleted');
END;

CREATE TRIGGER IF NOT EXISTS memory_frozen_columns
BEFORE UPDATE ON memory
WHEN OLD.id             <> NEW.id
  OR OLD.tenant_id      <> NEW.tenant_id
  OR OLD.user_id        <> NEW.user_id
  OR OLD.type           <> NEW.type
  OR OLD.tier           <> NEW.tier
  OR OLD.content        <> NEW.content
  OR OLD.content_hash   <> NEW.content_hash
  OR OLD.entry_hash     <> NEW.entry_hash
  OR OLD.source_channel <> NEW.source_channel
  OR OLD.t_valid        <> NEW.t_valid
  OR OLD.t_created      <> NEW.t_created
BEGIN
  SELECT RAISE(ABORT, 'E_MEMORY_IMMUTABLE: only t_invalid, t_expired and superseded_by may change');
END;

-- -------------------------------------------------------- 3.5 memory indexes
CREATE INDEX IF NOT EXISTS idx_memory_live         ON memory(tenant_id, user_id, type, tier) WHERE t_expired IS NULL;
CREATE INDEX IF NOT EXISTS idx_memory_subject      ON memory(tenant_id, subject, predicate, t_valid DESC);
CREATE INDEX IF NOT EXISTS idx_memory_content_hash ON memory(content_hash);
CREATE INDEX IF NOT EXISTS idx_memory_superseded   ON memory(superseded_by) WHERE superseded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memory_constraints  ON memory(tenant_id, user_id, predicate)
  WHERE type = 'constraint' AND t_expired IS NULL;

-- -------------------------------------------------- 3.6 mandates and nonces
CREATE TABLE IF NOT EXISTS mandates (
  id               TEXT    PRIMARY KEY,                 -- = jti (urn:uuid:...)
  tenant_id        TEXT    NOT NULL,
  kind             TEXT    NOT NULL CHECK (kind IN ('intent','cart','payment')),
  vc_jwt           TEXT    NOT NULL,
  jwt_hash         TEXT    NOT NULL CHECK (length(jwt_hash) = 64),   -- chain-binding target
  nonce            TEXT    NOT NULL,                    -- = jti; named per ARCHITECTURE section 6
  status           TEXT    NOT NULL CHECK (status IN
                     ('issued','verified','rejected','held','executed','expired','cancelled')),
  parent_id        TEXT    REFERENCES mandates(id),
  memory_digest    TEXT,                                -- 'sha256:<hex>' - cart + payment only
  cart_hash        TEXT,
  issuer_kid       TEXT    NOT NULL,
  iat              TEXT    NOT NULL,
  exp              TEXT    NOT NULL,
  created_event_id TEXT    NOT NULL REFERENCES events(id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_mandates_parent ON mandates(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mandates_kind   ON mandates(tenant_id, kind, status);

CREATE TABLE IF NOT EXISTS nonces (
  nonce            TEXT    NOT NULL,                    -- mandate jti
  purpose          TEXT    NOT NULL CHECK (purpose IN ('cart_verify','payment_execute')),
  tenant_id        TEXT    NOT NULL,
  payload_hash     TEXT    NOT NULL CHECK (length(payload_hash) = 64),  -- sha256 of the canonical request body
  idempotency_key  TEXT    NOT NULL,
  burned_at        TEXT    NOT NULL,
  burn_event_id    TEXT    NOT NULL REFERENCES events(id),
  response_json    TEXT    NOT NULL CHECK (json_valid(response_json)),  -- replayed verbatim on an identical retry
  PRIMARY KEY (nonce, purpose)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_nonces_idem ON nonces(tenant_id, purpose, idempotency_key);

-- ---------------------------------------------------------- 3.7 transactions
CREATE TABLE IF NOT EXISTS transactions (
  id                  TEXT    PRIMARY KEY,              -- txn_<uuid>
  tenant_id           TEXT    NOT NULL,
  user_id             TEXT    NOT NULL,
  cart_mandate_id     TEXT    NOT NULL REFERENCES mandates(id),
  payment_mandate_id  TEXT    REFERENCES mandates(id),
  rzp_order_id        TEXT,
  rzp_payment_link_id TEXT,
  rzp_payment_id      TEXT,
  amount_paise        INTEGER NOT NULL CHECK (amount_paise > 0),
  currency            TEXT    NOT NULL CHECK (length(currency) = 3),
  state               TEXT    NOT NULL CHECK (state IN
                        ('pending_cooloff','approved','link_issued','captured',
                         'failed','cancelled','parked')),
  cooloff_until       TEXT,
  cancelled_at        TEXT,                             -- set on cancel; bounds the 5 s restore window
  last_event_seq      INTEGER NOT NULL
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_txn_order ON transactions(rzp_order_id) WHERE rzp_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_txn_state      ON transactions(tenant_id, state);
CREATE INDEX IF NOT EXISTS idx_txn_cooloff    ON transactions(cooloff_until) WHERE state = 'pending_cooloff';

-- ----------------------------------------------------- 3.8 reservation tables
CREATE TABLE IF NOT EXISTS envelope_reservations (
  id              TEXT    PRIMARY KEY,                  -- rsv_<uuid>
  tenant_id       TEXT    NOT NULL,
  user_id         TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  period_key      TEXT    NOT NULL,                     -- '2026-08' for period='month'; the envelope's bucket
  amount_paise    INTEGER NOT NULL CHECK (amount_paise > 0),
  state           TEXT    NOT NULL CHECK (state IN ('open','captured','released')),
  txn_id          TEXT    NOT NULL,
  cart_mandate_id TEXT    NOT NULL,
  created_at      TEXT    NOT NULL,
  expires_at      TEXT    NOT NULL,                     -- cart mandate exp + 10 min grace
  event_id        TEXT    NOT NULL REFERENCES events(id)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_env_rsv_txn   ON envelope_reservations(txn_id);
CREATE INDEX        IF NOT EXISTS idx_env_rsv_open ON envelope_reservations(tenant_id, user_id, category, period_key)
  WHERE state = 'open';
CREATE INDEX        IF NOT EXISTS idx_env_rsv_exp  ON envelope_reservations(expires_at) WHERE state = 'open';

CREATE TABLE IF NOT EXISTS stock_reservations (
  reservation_id  TEXT    PRIMARY KEY,                  -- MINTED BY THE MERCHANT, carried in the signed quote
  tenant_id       TEXT    NOT NULL,
  merchant_id     TEXT    NOT NULL,
  sku_id          TEXT    NOT NULL,
  qty             INTEGER NOT NULL CHECK (qty > 0),
  quote_jti       TEXT    NOT NULL,
  cart_mandate_id TEXT    NOT NULL,
  state           TEXT    NOT NULL CHECK (state IN ('claimed','confirmed','released')),
  expires_at      TEXT    NOT NULL,
  event_id        TEXT    NOT NULL REFERENCES events(id)
) STRICT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_rsv_cart  ON stock_reservations(cart_mandate_id, sku_id);
CREATE INDEX        IF NOT EXISTS idx_stock_rsv_exp  ON stock_reservations(expires_at) WHERE state = 'claimed';

-- The band a merchant signed for one SKU. Written only by a merchant-signed ACP
-- request, in the same transaction as its ledger event, and read by
-- QuoteMatchCheck: the buyer's side must be able to refuse a below-floor quote
-- without trusting the seller's agent to have behaved. Clearing deletes the
-- row, because an absent floor is an absent authority; the history stays in the
-- append-only ledger, which is where history belongs.
CREATE TABLE IF NOT EXISTS sku_price_floors (
  tenant_id   TEXT    NOT NULL,
  merchant_id TEXT    NOT NULL,
  sku_id      TEXT    NOT NULL,
  floor_paise INTEGER NOT NULL CHECK (floor_paise > 0),
  list_paise  INTEGER NOT NULL CHECK (list_paise >= floor_paise),
  currency    TEXT    NOT NULL CHECK (length(currency) = 3),
  declared_at TEXT    NOT NULL,
  declared_by TEXT    NOT NULL,                    -- kid of the merchant key
  event_id    TEXT    NOT NULL REFERENCES events(id),
  PRIMARY KEY (tenant_id, sku_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_floors_merchant ON sku_price_floors(tenant_id, merchant_id);

-- -------------------------------------------------------- 3.9 flywheel folds
CREATE TABLE IF NOT EXISTS sku_price_history (
  id               TEXT    PRIMARY KEY,
  tenant_id        TEXT    NOT NULL,
  merchant_id      TEXT    NOT NULL,
  sku_id           TEXT    NOT NULL,
  price_paise      INTEGER NOT NULL,
  currency         TEXT    NOT NULL,
  t_valid_from     TEXT    NOT NULL,                    -- world-time the quote asserted
  t_valid_to       TEXT,                                -- closed when a newer quote supersedes it
  t_created        TEXT    NOT NULL,                    -- system-time we observed it (leak-free backtests)
  tier             INTEGER NOT NULL CHECK (tier >= 2),  -- P2+ only: cryptographically attested prices
  attestation_jti  TEXT,
  source_event_seq INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_price_sku  ON sku_price_history(tenant_id, sku_id, t_valid_from DESC);
CREATE INDEX IF NOT EXISTS idx_price_asof ON sku_price_history(sku_id, t_created);

CREATE TABLE IF NOT EXISTS merchant_trust (
  tenant_id             TEXT    NOT NULL,
  merchant_id           TEXT    NOT NULL,
  quotes_total          INTEGER NOT NULL DEFAULT 0,
  quote_mismatches      INTEGER NOT NULL DEFAULT 0,
  catalog_reads         INTEGER NOT NULL DEFAULT 0,
  manipulation_attempts INTEGER NOT NULL DEFAULT 0,
  refunds_requested     INTEGER NOT NULL DEFAULT 0,
  refunds_honored       INTEGER NOT NULL DEFAULT 0,
  cooloff_cancellations INTEGER NOT NULL DEFAULT 0,
  stock_conflicts       INTEGER NOT NULL DEFAULT 0,     -- tracked, but NOT scored (section 5.2 d)
  carts_total           INTEGER NOT NULL DEFAULT 0,
  trust_score           REAL    NOT NULL DEFAULT 0.5,
  last_event_seq        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, merchant_id)
) STRICT;

CREATE TABLE IF NOT EXISTS user_prefs (
  tenant_id         TEXT    NOT NULL,
  user_id           TEXT    NOT NULL,
  pref_key          TEXT    NOT NULL,                   -- 'brand:asics' | 'category:footwear' | 'wtp:running-shoe'
  value_json        TEXT    NOT NULL CHECK (json_valid(value_json)),
  tier              INTEGER NOT NULL CHECK (tier = 3),  -- P3 only, by construction
  weight            REAL    NOT NULL DEFAULT 1.0,       -- regret-adjusted
  observations      INTEGER NOT NULL DEFAULT 1,
  updated_event_seq INTEGER NOT NULL,
  PRIMARY KEY (tenant_id, user_id, pref_key)
) STRICT;

CREATE TABLE IF NOT EXISTS fold_state (
  fold_name  TEXT    PRIMARY KEY,
  last_seq   INTEGER NOT NULL DEFAULT 0,
  state_hash TEXT    NOT NULL DEFAULT '',
  updated_at TEXT    NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT    NOT NULL
) STRICT;

-- The audit UI's attack lane and RangeChip both read ledger events, never a side channel.
CREATE VIEW IF NOT EXISTS attack_lane AS
SELECT seq, ts, tenant_id, actor, kind, txn_id,
       json_extract(payload_json, '$.reason_code') AS reason_code,
       json_extract(payload_json, '$.attack_id')   AS attack_id,
       json_extract(payload_json, '$.human')       AS human
FROM events
WHERE kind = 'attack.detected'
   OR kind = 'memory.write.rejected'
   OR (kind = 'verdict.emitted' AND json_extract(payload_json, '$.decision') = 'reject');
