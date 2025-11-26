-- Cleanup Script for Duplicate Courses
-- This script identifies and removes duplicate courses for the same document
-- keeping only the most recent course for each document

-- WARNING: This will delete data permanently. Review the SELECT query first!

-- Step 1: Preview what will be deleted (RUN THIS FIRST)
-- Shows all courses that will be DELETED (older duplicates)
SELECT
  c1.id,
  c1.title,
  c1.document_id,
  c1.status,
  c1.created_at,
  'WILL BE DELETED' as action
FROM courses c1
WHERE EXISTS (
  SELECT 1
  FROM courses c2
  WHERE c2.document_id = c1.document_id
    AND c2.user_id = c1.user_id
    AND c2.created_at > c1.created_at
)
ORDER BY c1.document_id, c1.created_at DESC;

-- Step 2: Preview what will be KEPT (RUN THIS SECOND)
-- Shows the most recent course for each document (these will be kept)
SELECT DISTINCT ON (document_id, user_id)
  id,
  title,
  document_id,
  status,
  created_at,
  'WILL BE KEPT' as action
FROM courses
ORDER BY document_id, user_id, created_at DESC;

-- Step 3: DELETE duplicates (RUN THIS LAST, ONLY AFTER REVIEWING ABOVE QUERIES)
-- This keeps the most recent course for each document and deletes older ones
DELETE FROM courses
WHERE id IN (
  SELECT c1.id
  FROM courses c1
  WHERE EXISTS (
    SELECT 1
    FROM courses c2
    WHERE c2.document_id = c1.document_id
      AND c2.user_id = c1.user_id
      AND c2.created_at > c1.created_at
  )
);

-- Step 4: Verify cleanup (RUN AFTER DELETE)
-- This should show no duplicate document_ids per user
SELECT
  document_id,
  user_id,
  COUNT(*) as course_count,
  array_agg(id ORDER BY created_at DESC) as course_ids
FROM courses
GROUP BY document_id, user_id
HAVING COUNT(*) > 1;
