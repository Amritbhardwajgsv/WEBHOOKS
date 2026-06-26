Option 1: Move it to OneDrive (Recommended)

Upload the Excel file to OneDrive/SharePoint once
The company can still open and edit it locally via OneDrive sync (feels exactly like a local file)
Your server uses Microsoft Graph API to add rows automatically
Everyone always sees the latest version
Option 2: Store in S3

After each PDF is processed, the server generates/updates an Excel file and uploads it to S3
Company downloads the latest version whenever they need it
Simpler technically but less seamless
Option 3: API endpoint to download

Your server builds the Excel from MongoDB data on demand
Company hits a URL → downloads fresh .xlsx with all current data
No sync needed at all