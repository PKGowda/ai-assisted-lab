import sqlite3

# Connect to the SQLite database. It will be created if it does not exist.
connection = sqlite3.connect("placements.db")

# Create the applications table only if it does not already exist.
connection.execute(
    """
    CREATE TABLE IF NOT EXISTS applications (
        application_id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        job_role TEXT NOT NULL,
        application_date TEXT,
        status TEXT
    )
    """
)

# Save the table creation and close the database connection.
connection.commit()
connection.close()

print("Database and applications table created successfully.")
