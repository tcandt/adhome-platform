ALTER TABLE public_room_listings
  ADD COLUMN IF NOT EXISTS rental_model TEXT NOT NULL DEFAULT 'ENTIRE_ROOM';

UPDATE public_room_listings AS listing
SET rental_model = room.rental_model
FROM console_rooms AS room
WHERE room.public_listing_id = listing.id
  AND listing.rental_model IS DISTINCT FROM room.rental_model;
