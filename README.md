# JLS Lawn Tracker - Cross Platform Setup

To ensure the application works correctly on all browsers (Chrome, Safari, Firefox) and devices (iPhone, Android, Desktop), it is highly recommended to run it via a local web server rather than opening `index.html` directly.

Running from `file://` (double-clicking the HTML file) often causes security errors in Safari and Firefox that break the database connection and styling.

## How to Run (Recommended)

### Option 1: Using Node.js (Best)
If you have Node.js installed, run this command in the project folder:
```bash
npx serve
```
Then open the URL shown (usually `http://localhost:3000`) on your computer or phone.

### Option 2: Using Python
If you have Python installed:
```bash
python3 -m http.server
```
Then open `http://localhost:8000`.

## Features Fixed for Cross-Browser
- **SMS Links**: Now use standard formatting compatible with iOS and Android.
- **Styling**: CSS updated for better Safari/Firefox compatibility.
- **Database**: Warnings added if running in restricted modes.
