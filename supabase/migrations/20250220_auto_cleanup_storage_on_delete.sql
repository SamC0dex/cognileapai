-- Automatically delete storage files when documents are deleted
-- This ensures we don't accumulate orphaned PDF files in storage

CREATE OR REPLACE FUNCTION delete_storage_object_on_document_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete the storage object if storage_path exists
  IF OLD.storage_path IS NOT NULL THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'documents'
    AND name = OLD.storage_path;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to run before document deletion
DROP TRIGGER IF EXISTS trigger_delete_storage_on_document_delete ON public.documents;

CREATE TRIGGER trigger_delete_storage_on_document_delete
  BEFORE DELETE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION delete_storage_object_on_document_delete();

-- Add comment for documentation
COMMENT ON FUNCTION delete_storage_object_on_document_delete() IS
'Automatically deletes the PDF file from storage when a document record is deleted from the database. This prevents orphaned files from accumulating in storage.';
