UPDATE bookings SET status = 'APPROVED', window_end = NOW() + INTERVAL '8 hours' WHERE reference IN ('BK-2026-EX0001', 'BK-2026-EX0002');
SELECT reference, status, window_end FROM bookings WHERE reference IN ('BK-2026-EX0001', 'BK-2026-EX0002');
