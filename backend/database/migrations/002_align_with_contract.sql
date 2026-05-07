-- Intent Layer Protocol — align order-book schema with finalised on-chain types.
--
-- Tracks contract changes locked at commit e47e988 (Stages 0-3 + follow-up
-- security pass). Pre-Stage-4 cleanup; no production data exists yet so we
-- alter in place rather than back-fill.
--
-- Aligns with:
--   contracts/src/interfaces/IIntentSettler.sol — Intent struct (10 fields),
--     IntentState enum (None, Pending, Matched, Auctioning, Locked, Settled,
--     Cancelled, Refunded), IntentMeta packed slot.
--   contracts/src/SolverAuction.sol — uint16 solverFeeBps, MAX_PROPOSALS_PER_INTENT,
--     proposalDigest binding (chainId + contract address + intent hash).

BEGIN;

-- 1. Extend the state CHECK constraint to include AUCTIONING.
--    Contract enum order: None, Pending, Matched, Auctioning, Locked, Settled,
--    Cancelled, Refunded. NONE is omitted at the DB layer because a row only
--    exists once the contract has emitted IntentSubmitted (state >= Pending).
ALTER TABLE intents DROP CONSTRAINT chk_intents_state;
ALTER TABLE intents ADD CONSTRAINT chk_intents_state CHECK (
    state IN ('PENDING', 'MATCHED', 'AUCTIONING', 'LOCKED', 'SETTLED', 'CANCELLED', 'REFUNDED')
);

-- 2. Add the two Intent struct fields the original schema dropped.
--    refund_to is part of the EIP-712 hash so it must round-trip exactly;
--    nonce is the user replay-protection counter. Both come straight from
--    the IntentSubmitted event's Intent payload.
ALTER TABLE intents ADD COLUMN refund_to BYTEA NOT NULL DEFAULT '\x0000000000000000000000000000000000000000'::bytea;
ALTER TABLE intents ADD COLUMN nonce NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE intents ALTER COLUMN refund_to DROP DEFAULT;
ALTER TABLE intents ALTER COLUMN nonce DROP DEFAULT;

-- 3. Mirror the on-chain IntentMeta packed slot. submittedAt and matchTimestamp
--    are uint64 block timestamps; auctionDeadline is set by openAuction and
--    capped at intent.deadline. NULL until the corresponding event fires.
ALTER TABLE intents ADD COLUMN submitted_at_block_ts BIGINT;
ALTER TABLE intents ADD COLUMN match_timestamp BIGINT;
ALTER TABLE intents ADD COLUMN auction_deadline BIGINT;

-- 4. Tracking columns the Stage-5 frontend's status page needs to render
--    explorer links and show settlement progress without joining matches.
ALTER TABLE intents ADD COLUMN submit_tx_hash BYTEA;
ALTER TABLE intents ADD COLUMN settle_tx_hash BYTEA;
ALTER TABLE intents ADD COLUMN cancel_tx_hash BYTEA;

-- 5. Strengthen the matches table so it carries enough context for the
--    matching engine and the frontend without re-hitting the chain.
ALTER TABLE matches ADD COLUMN source_chain_id INT;
ALTER TABLE matches ADD COLUMN dest_chain_id INT;
ALTER TABLE matches ADD COLUMN execute_match_tx_hash BYTEA;
ALTER TABLE matches ADD COLUMN confirm_tx_hash BYTEA;

-- 6. Solver-proposal columns to align with the on-chain SolverAuction:
--    - solver_fee_bps narrows to fit the on-chain uint16 (0..65535)
--    - winner_announced flips when SolverAuction.WinnerSelected fires for this row
ALTER TABLE solver_proposals ADD CONSTRAINT solver_fee_bps_uint16 CHECK (
    solver_fee_bps >= 0 AND solver_fee_bps <= 65535
);
ALTER TABLE solver_proposals ADD COLUMN winner_announced BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE solver_proposals ADD COLUMN proposal_digest BYTEA;

-- 7. Resumable-indexer cursor table. One row per (chain_id, contract_address)
--    pair so a restart re-subscribes from the last block we durably committed.
--    Block reorg handling is not modelled here; the indexer waits for LayerZero
--    DVN-style confirmation depth (12 blocks on Eth, 1 on Base) before writing.
CREATE TABLE IF NOT EXISTS indexer_cursors (
    chain_id INT NOT NULL,
    contract_address BYTEA NOT NULL,
    last_processed_block BIGINT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (chain_id, contract_address)
);

CREATE INDEX IF NOT EXISTS idx_intents_nonce ON intents (user_address, nonce);

COMMIT;
