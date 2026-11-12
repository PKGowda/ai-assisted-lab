import csv
import io
import sqlite3
from pathlib import Path


DATABASE_FILE = Path(__file__).with_name("placements.db")


def connect_database():
    return sqlite3.connect(DATABASE_FILE)


def ensure_interview_date_column(connection):
    columns = {
        row[1] for row in connection.execute("PRAGMA table_info(applications)")
    }
    if "interview_date" not in columns:
        connection.execute("ALTER TABLE applications ADD COLUMN interview_date TEXT")


def initialize_database():
    connection = connect_database()
    try:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS applications (
                application_id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name TEXT NOT NULL,
                job_role TEXT NOT NULL,
                application_date TEXT,
                status TEXT,
                interview_date TEXT
            )
            """
        )
        ensure_interview_date_column(connection)
        connection.commit()
    finally:
        connection.close()


def get_applications(connection, company_name="", status=None):
    query = """
        SELECT application_id, company_name, job_role, application_date, status,
               interview_date
        FROM applications
    """
    conditions = []
    parameters = []

    if company_name:
        conditions.append("company_name LIKE ? ESCAPE '\\'")
        escaped_name = (
            company_name.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
        )
        parameters.append(f"%{escaped_name}%")
    if status is not None:
        conditions.append("status = ?")
        parameters.append(status)

    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY application_id"
    return connection.execute(query, parameters).fetchall()


def get_application_statuses(connection):
    return [
        row[0]
        for row in connection.execute(
            """
            SELECT DISTINCT status
            FROM applications
            WHERE status IS NOT NULL AND status != ''
            ORDER BY status
            """
        ).fetchall()
    ]


def update_application(connection, application_id, status, interview_date):
    cursor = connection.execute(
        """
        UPDATE applications
        SET status = ?, interview_date = ?
        WHERE application_id = ?
        """,
        (status, interview_date, application_id),
    )
    connection.commit()
    return cursor.rowcount == 1


def delete_application(connection, application_id):
    cursor = connection.execute(
        "DELETE FROM applications WHERE application_id = ?", (application_id,)
    )
    connection.commit()
    return cursor.rowcount == 1


def get_upcoming_interviews(connection, today):
    return connection.execute(
        """
        SELECT application_id, company_name, job_role, interview_date, status
        FROM applications
        WHERE interview_date IS NOT NULL AND interview_date >= ?
        ORDER BY interview_date, company_name, application_id
        """,
        (today,),
    ).fetchall()


def applications_to_csv(connection):
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "application_id",
            "company_name",
            "job_role",
            "application_date",
            "status",
            "interview_date",
        ]
    )
    writer.writerows(get_applications(connection))
    return output.getvalue()
