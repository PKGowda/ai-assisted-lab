# ai-assisted-lab

## Placement Application Tracker

A Streamlit application for recording job applications, searching by company,
filtering and updating statuses, scheduling interviews, and exporting records
to CSV. It also displays application totals, popular roles, status summaries,
and upcoming interviews. Data is stored in the SQLite database `placements.db`.

The database is created locally with `python init_db.py` and is excluded from
version control so application records are not published to GitHub. Running
`python init_db.py` on an existing database adds the interview date column
without deleting existing records.

### Features

- Search applications by company and filter the list by status.
- Update application status and optional interview dates.
- Delete applications only after confirming the deletion.
- Download all application records as a CSV file.
- View interviews scheduled for today or a future date.

### Run locally

1. Install the project dependencies:

   ```powershell
   python -m pip install -r requirements.txt
   ```

2. If you have not created the database yet, initialize it:

   ```powershell
   python init_db.py
   ```

3. Start the Streamlit application:

   ```powershell
   streamlit run app.py
   ```

Streamlit displays a local URL in the terminal. Open that URL in your browser to use the tracker.

Run the feature tests with:

```powershell
python -m unittest discover -s tests -v
```
