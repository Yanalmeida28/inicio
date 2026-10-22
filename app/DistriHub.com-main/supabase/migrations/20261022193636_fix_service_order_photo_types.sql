-- The photo RPC and clients use entry/exit. Keep the historical Portuguese
-- values valid as well, without changing or discarding existing attachments.
ALTER TABLE public.service_order_photos
  DROP CONSTRAINT IF EXISTS service_order_photos_photo_type_check;
ALTER TABLE public.service_order_photos
  ADD CONSTRAINT service_order_photos_photo_type_check
  CHECK (photo_type IN ('entry', 'exit', 'entrada', 'saida', 'legacy'));
