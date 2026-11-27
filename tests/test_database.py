"""Check the lab 4 SQLite schema and its example data."""
from datetime import datetime
from pathlib import Path
import sqlite3
import unittest


ROOT = Path(__file__).resolve().parents[1]

DAY_ENTRIES = """
SELECT entry_no, amount_ml, consumed_at_ms
FROM water_entries
WHERE profile_id = :profile_id
  AND consumed_at_ms >= :day_start_ms
  AND consumed_at_ms < :next_day_start_ms
ORDER BY consumed_at_ms DESC, entry_no DESC;
"""

DAY_SUMMARY = """
WITH daily_total AS (
    SELECT COALESCE(SUM(amount_ml), 0) AS total_ml
    FROM water_entries
    WHERE profile_id = :profile_id
      AND consumed_at_ms >= :day_start_ms
      AND consumed_at_ms < :next_day_start_ms
)
SELECT
    daily_total.total_ml,
    daily_goals.target_ml,
    CAST(ROUND(100.0 * daily_total.total_ml / daily_goals.target_ml) AS INTEGER) AS percent,
    daily_total.total_ml >= daily_goals.target_ml AS goal_reached
FROM profiles
CROSS JOIN daily_total
LEFT JOIN daily_goals USING (profile_id)
WHERE profiles.profile_id = :profile_id;
"""


def epoch_ms(iso_time):
    return int(datetime.fromisoformat(iso_time).timestamp() * 1000)


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.executescript((ROOT / "database/schema.sql").read_text(encoding="utf-8"))
        self.db.executescript((ROOT / "database/seed_data.sql").read_text(encoding="utf-8"))
        self.day = {
            "profile_id": 1,
            "day_start_ms": epoch_ms("2026-11-27T00:00:00+03:00"),
            "next_day_start_ms": epoch_ms("2026-11-28T00:00:00+03:00"),
        }

    def test_schema_and_seed_integrity(self):
        self.assertEqual(self.db.execute("PRAGMA foreign_keys").fetchone(), (1,))
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchall(), [("ok",)])
        intervals = self.db.execute(
            "SELECT interval_minutes FROM reminder_intervals ORDER BY interval_minutes"
        )
        self.assertEqual(intervals.fetchall(), [(30,), (60,), (120,)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM water_entries").fetchone(), (5,))

    def test_day_boundaries_and_profile_isolation(self):
        entries = self.db.execute(DAY_ENTRIES, self.day).fetchall()
        self.assertEqual([(row[0], row[1]) for row in entries], [(3, 500), (2, 250)])
        self.assertEqual(entries[-1][2], self.day["day_start_ms"])
        summary = self.db.execute(DAY_SUMMARY, self.day).fetchone()
        self.assertEqual(summary, (750, 2000, 38, 0))
        second_profile = self.db.execute(DAY_SUMMARY, {**self.day, "profile_id": 2}).fetchone()
        self.assertEqual(second_profile, (600, None, None, None))

    def test_progress_can_exceed_one_hundred_percent(self):
        self.db.execute("UPDATE daily_goals SET target_ml = 500 WHERE profile_id = 1")
        self.assertEqual(self.db.execute(DAY_SUMMARY, self.day).fetchone(), (750, 500, 150, 1))

    def test_rejects_invalid_values(self):
        cases = [
            "UPDATE water_entries SET amount_ml = 0",
            "UPDATE water_entries SET amount_ml = 2001",
            "UPDATE water_entries SET amount_ml = 12.5",
            "UPDATE water_entries SET consumed_at_ms = 8640000000000001",
            "UPDATE daily_goals SET target_ml = 0",
            "UPDATE daily_goals SET target_ml = 10001",
            "UPDATE reminder_settings SET enabled = 2",
            "UPDATE reminder_settings SET interval_minutes = 45",
            "INSERT INTO reminder_intervals VALUES (45, '45 минут')",
            "INSERT INTO daily_goals (profile_id, target_ml) VALUES (NULL, 2000)",
        ]
        for statement in cases:
            with self.subTest(statement=statement), self.assertRaises(sqlite3.IntegrityError):
                with self.db:
                    self.db.execute(statement)

    def test_keys_reject_duplicates_and_orphans(self):
        cases = [
            "INSERT INTO water_entries VALUES (1, 1, 100, 0)",
            "INSERT INTO water_entries VALUES (99, 1, 100, 0)",
            "INSERT INTO daily_goals VALUES (1, 1500)",
            "INSERT INTO daily_goals VALUES (99, 1500)",
            "INSERT INTO reminder_settings (profile_id) VALUES (99)",
            "DELETE FROM reminder_intervals WHERE interval_minutes = 30",
        ]
        for statement in cases:
            with self.subTest(statement=statement), self.assertRaises(sqlite3.IntegrityError):
                with self.db:
                    self.db.execute(statement)

    def test_reminder_defaults_and_settings_without_entries(self):
        self.db.execute("INSERT INTO reminder_settings (profile_id) VALUES (2)")
        settings = self.db.execute(
            "SELECT enabled, interval_minutes FROM reminder_settings WHERE profile_id = 2"
        )
        self.assertEqual(settings.fetchone(), (0, 60))

        self.db.execute("DELETE FROM water_entries WHERE profile_id = 1")
        self.assertEqual(self.db.execute(DAY_SUMMARY, self.day).fetchone(), (0, 2000, 0, 0))
        retained = self.db.execute(
            "SELECT enabled, interval_minutes FROM reminder_settings WHERE profile_id = 1"
        )
        self.assertEqual(retained.fetchone(), (1, 30))

    def test_profile_deletion_cascades_to_its_rows(self):
        self.db.execute("DELETE FROM profiles WHERE profile_id = 1")
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertIsNone(self.db.execute(DAY_SUMMARY, self.day).fetchone())
        self.assertEqual(self.db.execute("SELECT profile_id FROM water_entries").fetchall(), [(2,)])
        self.assertEqual(self.db.execute("SELECT count(*) FROM daily_goals").fetchone(), (0,))
        self.assertEqual(self.db.execute("SELECT count(*) FROM reminder_settings").fetchone(), (0,))
        self.assertEqual(self.db.execute("SELECT count(*) FROM reminder_intervals").fetchone(), (3,))

    def test_day_query_uses_the_time_index(self):
        plan = self.db.execute("EXPLAIN QUERY PLAN " + DAY_ENTRIES, self.day).fetchall()
        self.assertTrue(any("idx_water_entries_profile_time" in row[3] for row in plan), plan)
        reminder_indexes = self.db.execute("PRAGMA index_list('reminder_settings')").fetchall()
        self.assertIn("idx_reminder_settings_interval", {row[1] for row in reminder_indexes})


if __name__ == "__main__":
    unittest.main(verbosity=2)
