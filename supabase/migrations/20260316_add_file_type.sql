ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT 'pdf';

UPDATE public.documents SET file_type = 'pdf' WHERE file_type IS NULL;

ALTER TABLE public.documents
  ALTER COLUMN file_type SET NOT NULL,
  ALTER COLUMN file_type SET DEFAULT 'pdf';
