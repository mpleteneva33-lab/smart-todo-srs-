-- SQLite 3.37+. Water intake tracker, variant 24.
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

CREATE TABLE profiles (
    profile_id INTEGER PRIMARY KEY CHECK (profile_id > 0),
    display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 80)
) STRICT;

CREATE TABLE water_entries (
    profile_id INTEGER NOT NULL REFERENCES profiles(profile_id) ON DELETE CASCADE,
    entry_no INTEGER NOT NULL CHECK (entry_no BETWEEN 1 AND 9007199254740991),
    amount_ml INTEGER NOT NULL CHECK (amount_ml BETWEEN 1 AND 2000),
    consumed_at_ms INTEGER NOT NULL
        CHECK (consumed_at_ms BETWEEN -8640000000000000 AND 8640000000000000),
    PRIMARY KEY (profile_id, entry_no)
) STRICT, WITHOUT ROWID;

CREATE TABLE daily_goals (
    profile_id INTEGER PRIMARY KEY REFERENCES profiles(profile_id) ON DELETE CASCADE,
    target_ml INTEGER NOT NULL CHECK (target_ml BETWEEN 1 AND 10000)
) STRICT, WITHOUT ROWID;

CREATE TABLE reminder_intervals (
    interval_minutes INTEGER PRIMARY KEY CHECK (interval_minutes IN (30, 60, 120)),
    label TEXT NOT NULL CHECK (length(trim(label)) > 0)
) STRICT, WITHOUT ROWID;

-- Reference values are part of the schema so the default always has a parent row.
INSERT INTO reminder_intervals (interval_minutes, label) VALUES
    (30, '30 минут'),
    (60, '60 минут'),
    (120, '120 минут');

CREATE TABLE reminder_settings (
    profile_id INTEGER PRIMARY KEY REFERENCES profiles(profile_id) ON DELETE CASCADE,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
    interval_minutes INTEGER NOT NULL DEFAULT 60
        REFERENCES reminder_intervals(interval_minutes) ON DELETE RESTRICT
) STRICT, WITHOUT ROWID;

CREATE INDEX idx_water_entries_profile_time
    ON water_entries (profile_id, consumed_at_ms DESC, entry_no DESC);

CREATE INDEX idx_reminder_settings_interval
    ON reminder_settings (interval_minutes);

COMMIT;
