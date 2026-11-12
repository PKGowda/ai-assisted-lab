import sqlite3
from pathlib import Path

import streamlit as st


DATABASE_FILE = Path(__file__).with_name("placements.db")
APPLICATION_STATUSES = [
    "Applied",
    "Shortlisted",
    "Interview Scheduled",
    "Selected",
    "Rejected",
]


def get_connection():
    """Open a connection to the placement database."""
    if not DATABASE_FILE.exists():
        st.error(
            f"Database not found: {DATABASE_FILE}. "
            "Create placements.db and the applications table first."
        )
        st.stop()

    return sqlite3.connect(DATABASE_FILE)


def main():
    st.set_page_config(page_title="Placement Application Tracker", page_icon="📋")
    st.title("Placement Application Tracker")
    st.write("Add applications and keep track of your placement progress.")

    # Add a new application.
    st.header("Add Application")
    with st.form("application_form"):
        company_name = st.text_input("Company Name")
        job_role = st.text_input("Job Role")
        application_date = st.date_input("Application Date")
        status = st.selectbox("Status", APPLICATION_STATUSES)
        submitted = st.form_submit_button("Add Application")

    if submitted:
        if not company_name.strip() or not job_role.strip():
            st.error("Company Name and Job Role cannot be empty.")
        else:
            connection = get_connection()
            try:
                connection.execute(
                    """
                    INSERT INTO applications (
                        company_name, job_role, application_date, status
                    )
                    VALUES (?, ?, ?, ?)
                    """,
                    (
                        company_name.strip(),
                        job_role.strip(),
                        application_date.isoformat(),
                        status,
                    ),
                )
                connection.commit()
            finally:
                connection.close()

            st.success("Application added successfully.")

    # Load application records and summary information from SQLite.
    connection = get_connection()
    try:
        applications = connection.execute(
            """
            SELECT application_id, company_name, job_role, application_date, status
            FROM applications
            ORDER BY application_id
            """
        ).fetchall()
        total_applications = connection.execute(
            "SELECT COUNT(*) FROM applications"
        ).fetchone()[0]
        most_applied_role = connection.execute(
            """
            SELECT job_role, COUNT(*) AS application_count
            FROM applications
            GROUP BY job_role
            ORDER BY application_count DESC, job_role ASC
            LIMIT 1
            """
        ).fetchone()
        status_rows = connection.execute(
            """
            SELECT status, COUNT(*)
            FROM applications
            GROUP BY status
            """
        ).fetchall()
    finally:
        connection.close()

    # Show all saved applications.
    st.header("View Applications")
    if applications:
        st.dataframe(
            [
                {
                    "application_id": row[0],
                    "company_name": row[1],
                    "job_role": row[2],
                    "application_date": row[3],
                    "status": row[4],
                }
                for row in applications
            ],
            hide_index=True,
        )
    else:
        st.info("No applications are available yet.")

    # Show the total number of saved applications.
    st.header("Total Applications")
    st.metric("Applications", total_applications)

    # Show the role with the most applications. Ties are ordered alphabetically.
    st.header("Most Applied Role")
    if most_applied_role is None:
        st.info("No applications are available to identify a most-applied role.")
    else:
        st.write(
            f"**{most_applied_role[0]}** "
            f"({most_applied_role[1]} application(s))"
        )

    # Count each supported status and include any unexpected database values.
    st.header("Status-wise Summary")
    status_counts = {application_status: 0 for application_status in APPLICATION_STATUSES}
    for application_status, count in status_rows:
        label = application_status or "Unspecified"
        status_counts[label] = count

    status_summary = [
        {"Status": application_status, "Applications": count}
        for application_status, count in status_counts.items()
    ]
    st.dataframe(status_summary, hide_index=True)
    st.bar_chart(status_summary, x="Status", y="Applications")


if __name__ == "__main__":
    main()
