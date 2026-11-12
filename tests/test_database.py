import csv
import sqlite3
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import database
from streamlit.testing.v1 import AppTest


class DatabaseFeatureTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.database_path = Path(self.temporary_directory.name) / "placements.db"
        self.database_path.touch()
        self.database_path_patch = patch.object(
            database, "DATABASE_FILE", self.database_path
        )
        self.database_path_patch.start()
        database.initialize_database()
        self.connection = database.connect_database()
        self.connection.executemany(
            """
            INSERT INTO applications (
                company_name, job_role, application_date, status, interview_date
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                ("Northwind", "Engineer", "2026-11-01", "Applied", None),
                ("Contoso", "Analyst", "2026-11-02", "Interview Scheduled", "2026-11-13"),
                ("Fabrikam", "Designer", "2026-11-03", "Rejected", "2026-11-11"),
            ],
        )
        self.connection.commit()

    def tearDown(self):
        self.connection.close()
        self.database_path_patch.stop()
        self.temporary_directory.cleanup()

    def test_company_search_is_literal_case_insensitive_and_filterable(self):
        results = database.get_applications(
            self.connection, company_name="contoso", status="Interview Scheduled"
        )

        self.assertEqual([row[1] for row in results], ["Contoso"])
        self.assertEqual(
            database.get_applications(self.connection, company_name="%"),
            [],
        )

    def test_update_changes_status_and_interview_date(self):
        application_id = database.get_applications(self.connection)[0][0]

        updated = database.update_application(
            self.connection, application_id, "Shortlisted", "2026-11-20"
        )

        self.assertTrue(updated)
        record = database.get_applications(self.connection)[0]
        self.assertEqual(record[4:], ("Shortlisted", "2026-11-20"))

    def test_delete_requires_existing_application(self):
        application_id = database.get_applications(self.connection)[0][0]

        self.assertTrue(database.delete_application(self.connection, application_id))
        self.assertFalse(database.delete_application(self.connection, application_id))
        self.assertEqual(len(database.get_applications(self.connection)), 2)

    def test_upcoming_interviews_include_today_and_future_only(self):
        self.connection.execute(
            "UPDATE applications SET interview_date = '2026-11-12' "
            "WHERE company_name = 'Northwind'"
        )
        self.connection.commit()

        interviews = database.get_upcoming_interviews(self.connection, "2026-11-12")

        self.assertEqual(
            [(row[1], row[3]) for row in interviews],
            [("Northwind", "2026-11-12"), ("Contoso", "2026-11-13")],
        )

    def test_csv_export_includes_all_records_and_interview_date(self):
        exported = database.applications_to_csv(self.connection)
        rows = list(csv.DictReader(exported.splitlines()))

        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1]["company_name"], "Contoso")
        self.assertEqual(rows[1]["interview_date"], "2026-11-13")
        self.assertIn("application_id", rows[0])

    def test_initialization_migrates_existing_database_without_losing_records(self):
        self.connection.close()
        connection = sqlite3.connect(self.database_path)
        try:
            connection.execute("DROP TABLE applications")
            connection.execute(
                """
                CREATE TABLE applications (
                    application_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    company_name TEXT NOT NULL,
                    job_role TEXT NOT NULL,
                    application_date TEXT,
                    status TEXT
                )
                """
            )
            connection.execute(
                """
                INSERT INTO applications (
                    company_name, job_role, application_date, status
                )
                VALUES ('Existing Co', 'Engineer', '2026-11-01', 'Applied')
                """
            )
            connection.commit()
        finally:
            connection.close()

        database.initialize_database()
        database.initialize_database()

        connection = database.connect_database()
        try:
            record = database.get_applications(connection)[0]
            columns = {
                row[1] for row in connection.execute("PRAGMA table_info(applications)")
            }
        finally:
            connection.close()
        self.connection = database.connect_database()

        self.assertEqual(record[1:5], ("Existing Co", "Engineer", "2026-11-01", "Applied"))
        self.assertIsNone(record[5])
        self.assertIn("interview_date", columns)

    def test_tracker_page_renders_without_errors(self):
        app_path = Path(__file__).parents[1] / "app.py"

        app = AppTest.from_file(str(app_path)).run()

        self.assertFalse(app.exception)
        self.assertEqual(len(app.get("download_button")), 1)

    def test_company_search_and_status_filter_are_wired_to_the_page(self):
        app_path = Path(__file__).parents[1] / "app.py"
        app = AppTest.from_file(str(app_path)).run()

        app.text_input[2].set_value("contoso")
        app.selectbox[1].select("Interview Scheduled")
        app.run()
        self.assertEqual(
            app.dataframe[0].value["company_name"].tolist(), ["Contoso"]
        )

        app.selectbox[1].select("Rejected").run()
        self.assertIn(
            "No applications match the current search and status filter.",
            [message.value for message in app.info],
        )

    def test_ui_add_update_and_confirmed_delete(self):
        app_path = Path(__file__).parents[1] / "app.py"
        app = AppTest.from_file(str(app_path)).run()

        app.text_input[0].set_value("Globex")
        app.text_input[1].set_value("Developer")
        app.date_input[1].set_value(date(2026, 11, 20))
        app.button(key="FormSubmitter:application_form-Add Application").click().run()
        self.assertFalse(app.exception)

        connection = database.connect_database()
        try:
            application_id = connection.execute(
                "SELECT application_id FROM applications WHERE company_name = 'Globex'"
            ).fetchone()[0]
        finally:
            connection.close()

        app.selectbox(key=f"status_{application_id}").select("Selected")
        app.date_input(key=f"interview_date_{application_id}").set_value(
            date(2026, 11, 21)
        )
        app.button(
            key=f"FormSubmitter:edit_application_{application_id}-Save changes"
        ).click().run()
        self.assertFalse(app.exception)

        connection = database.connect_database()
        try:
            record = connection.execute(
                """
                SELECT status, interview_date
                FROM applications WHERE application_id = ?
                """,
                (application_id,),
            ).fetchone()
        finally:
            connection.close()
        self.assertEqual(record, ("Selected", "2026-11-21"))

        app.button(
            key=f"FormSubmitter:delete_application_{application_id}-Delete application"
        ).click().run()
        self.assertFalse(app.exception)
        self.assertTrue(app.warning)

        app.checkbox(key=f"confirm_delete_{application_id}").check()
        app.button(
            key=f"FormSubmitter:delete_application_{application_id}-Delete application"
        ).click().run()
        self.assertFalse(app.exception)
        connection = database.connect_database()
        try:
            self.assertEqual(len(database.get_applications(connection)), 3)
        finally:
            connection.close()


if __name__ == "__main__":
    unittest.main()
