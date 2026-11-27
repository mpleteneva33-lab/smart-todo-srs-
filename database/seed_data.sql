-- Synthetic example data for a newly created database.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

INSERT INTO profiles (profile_id, display_name) VALUES
    (1, 'Основной журнал'),
    (2, 'Учебный журнал');

-- In UTC+03:00, rows 2 and 3 for profile 1 fall on 27 November (750 ml).
-- Rows 1 and 4 are just outside the calendar day; row 1 has millisecond precision.
INSERT INTO water_entries (profile_id, entry_no, amount_ml, consumed_at_ms) VALUES
    (1, 1, 125, CAST(strftime('%s', '2026-11-26T23:59:59+03:00') AS INTEGER) * 1000 + 999),
    (1, 2, 250, CAST(strftime('%s', '2026-11-27T00:00:00+03:00') AS INTEGER) * 1000),
    (1, 3, 500, CAST(strftime('%s', '2026-11-27T08:30:00+03:00') AS INTEGER) * 1000),
    (1, 4, 300, CAST(strftime('%s', '2026-11-28T00:00:00+03:00') AS INTEGER) * 1000),
    (2, 1, 600, CAST(strftime('%s', '2026-11-27T09:30:00+03:00') AS INTEGER) * 1000);

INSERT INTO daily_goals (profile_id, target_ml) VALUES (1, 2000);
INSERT INTO reminder_settings (profile_id, enabled, interval_minutes) VALUES (1, 1, 30);
-- Profile 2 has no goal and uses the default reminder settings.

COMMIT;
