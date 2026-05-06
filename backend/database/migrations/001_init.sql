-- Intent Protocol Layer — initial schema (skeleton)
CREATE TABLE IF NOT EXISTS intents (
    id BIGSERIAL PRIMARY KEY,
    intent_hash BYTEA UNIQUE NOT NULL,
    user_address BYTEA NOT NULL,
    source_chain_id INT NOT NULL,
    source_token BYTEA NOT NULL,
    source_amount NUMERIC NOT NULL,
    dest_chain_id INT NOT NULL,
    dest_token BYTEA NOT NULL,
    min_dest_amount NUMERIC NOT NULL,
    deadline BIGINT NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT NOW(),
    settled_at TIMESTAMP,
    CONSTRAINT idx_intents_state CHECK (state IN ('PENDING', 'MATCHED', 'LOCKED', 'SETTLED', 'CANCELLED', 'REFUNDED'))
);

CREATE INDEX IF NOT EXISTS idx_intents_state ON intents (state);
CREATE INDEX IF NOT EXISTS idx_intents_chains ON intents (source_chain_id, dest_chain_id);
CREATE INDEX IF NOT EXISTS idx_intents_deadline ON intents (deadline);
CREATE INDEX IF NOT EXISTS idx_intents_user ON intents (user_address);

CREATE TABLE IF NOT EXISTS matches (
    id BIGSERIAL PRIMARY KEY,
    intent_hash_a BYTEA NOT NULL,
    intent_hash_b BYTEA NOT NULL,
    matched_at TIMESTAMP DEFAULT NOW(),
    settled_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS solver_proposals (
    id BIGSERIAL PRIMARY KEY,
    intent_hash BYTEA NOT NULL,
    solver_address BYTEA NOT NULL,
    proposed_output_amount NUMERIC NOT NULL,
    solver_fee_bps INT NOT NULL,
    signature BYTEA NOT NULL,
    submitted_at TIMESTAMP DEFAULT NOW(),
    accepted BOOLEAN DEFAULT FALSE
);
