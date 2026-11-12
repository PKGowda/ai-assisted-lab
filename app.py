from datetime import date

import sqlite3

import streamlit as st

import database

APPLICATION_STATUSES = [
    "Applied",
    "Shortlisted",
    "Interview Scheduled",
    "Selected",
    "Rejected",
]


def get_connection():
    """Open a connection to the placement database."""
    if not database.DATABASE_FILE.exists():
        st.error(
            f"Database not found: {database.DATABASE_FILE}. "
            "Create placements.db and the applications table first."
        )
        st.stop()

    connection = database.connect_database()
    try:
        database.ensure_interview_date_column(connection)
        connection.commit()
    except sqlite3.Error:
        connection.close()
        raise
    return connection


def main():
    st.set_page_config(page_title="Placement Application Tracker", page_icon="📋")
    st.title("Placement Application Tracker")
    st.write("Add applications and keep track of your placement progress.")
    feedback = st.session_state.pop("application_feedback", None)
    if feedback:
        st.success(feedback)

    connection = get_connection()
    try:
        stored_statuses = database.get_application_statuses(connection)
    finally:
        connection.close()
    status_options = list(dict.fromkeys(APPLICATION_STATUSES + stored_statuses))

    # Add a new application.
    st.header("Add Application")
    with st.form("application_form"):
        company_name = st.text_input("Company Name")
        job_role = st.text_input("Job Role")
        application_date = st.date_input("Application Date")
        status = st.selectbox("Status", APPLICATION_STATUSES)
        interview_date = st.date_input("Interview Date (optional)", value=None)
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
                        company_name, job_role, application_date, status,
                        interview_date
                    )
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        company_name.strip(),
                        job_role.strip(),
                        application_date.isoformat(),
                        status,
                        interview_date.isoformat() if interview_date else None,
                    ),
                )
                connection.commit()
            finally:
                connection.close()

            st.success("Application added successfully.")

    # Load application records and summary information from SQLite.
    search_term = st.text_input("Search by company name")
    selected_status = st.selectbox(
        "Filter by status", ["All statuses"] + status_options
    )

    connection = get_connection()
    try:
        applications = database.get_applications(
            connection,
            company_name=search_term.strip(),
            status=None if selected_status == "All statuses" else selected_status,
        )
        upcoming_interviews = database.get_upcoming_interviews(
            connection, date.today().isoformat()
        )
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
        csv_data = database.applications_to_csv(connection)
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
                    "interview_date": row[5],
                }
                for row in applications
            ],
            hide_index=True,
        )
        for application in applications:
            application_id, company, role, _, current_status, current_interview_date = (
                application
            )
            with st.expander(f"{company} - {role} (ID {application_id})"):
                with st.form(key=f"edit_application_{application_id}"):
                    status_index = (
                        status_options.index(current_status)
                        if current_status in status_options
                        else 0
                    )
                    updated_status = st.selectbox(
                        "Status",
                        status_options,
                        index=status_index,
                        key=f"status_{application_id}",
                    )
                    parsed_interview_date = (
                        date.fromisoformat(current_interview_date)
                        if current_interview_date
                        else None
                    )
                    updated_interview_date = st.date_input(
                        "Interview Date (optional)",
                        value=parsed_interview_date,
                        key=f"interview_date_{application_id}",
                    )
                    update_submitted = st.form_submit_button("Save changes")
                if update_submitted:
                    connection = get_connection()
                    try:
                        updated = database.update_application(
                            connection,
                            application_id,
                            updated_status,
                            (
                                updated_interview_date.isoformat()
                                if updated_interview_date
                                else None
                            ),
                        )
                    finally:
                        connection.close()
                    if updated:
                        st.session_state["application_feedback"] = (
                            "Application updated successfully."
                        )
                        st.rerun()

                with st.form(key=f"delete_application_{application_id}"):
                    confirmed = st.checkbox(
                        f"Confirm deletion of application {application_id}",
                        key=f"confirm_delete_{application_id}",
                    )
                    delete_submitted = st.form_submit_button("Delete application")
                if delete_submitted:
                    if not confirmed:
                        st.warning("Confirm deletion before removing this application.")
                    else:
                        connection = get_connection()
                        try:
                            deleted = database.delete_application(
                                connection, application_id
                            )
                        finally:
                            connection.close()
                        if deleted:
                            st.session_state["application_feedback"] = (
                                "Application deleted successfully."
                            )
                            st.rerun()
    else:
        st.info("No applications match the current search and status filter.")

    st.download_button(
        "Download all applications as CSV",
        data=csv_data,
        file_name="applications.csv",
        mime="text/csv",
    )

    st.header("Upcoming Interviews")
    if upcoming_interviews:
        st.dataframe(
            [
                {
                    "interview_date": row[3],
                    "company_name": row[1],
                    "job_role": row[2],
                    "status": row[4],
                }
                for row in upcoming_interviews
            ],
            hide_index=True,
        )
    else:
        st.info("No upcoming interviews are scheduled.")

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
