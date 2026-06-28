-- Fix the review_cards unique constraint to include source_set_id.
-- The old constraint UNIQUE(user_id, source_type, source_id) causes conflicts when
-- multiple quiz/flashcard sets share generic question IDs (q1, q2, q3...).
-- The new constraint scopes uniqueness to the source set so each set has independent SM-2 cards.

-- Drop the old constraint
ALTER TABLE review_cards
  DROP CONSTRAINT IF EXISTS review_cards_user_id_source_type_source_id_key;

-- Add the correct constraint that includes source_set_id
ALTER TABLE review_cards
  ADD CONSTRAINT review_cards_user_id_source_type_source_set_source_id_key
  UNIQUE (user_id, source_type, source_set_id, source_id);
