# ai-assisted-lab

## Placement Application Tracker

A Streamlit application for recording job applications and reviewing application totals, popular roles, and status summaries. It stores records in the SQLite database `placements.db`.

The database is created locally with `python init_db.py` and is excluded from
version control so application records are not published to GitHub.

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
