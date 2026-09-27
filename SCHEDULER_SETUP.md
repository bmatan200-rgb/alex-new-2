# Reliable automatic SMS reminders

The app's in-process `node-cron` tasks are useful for local development, but they are not a reliable production clock on Cloud Run when the service uses request-based CPU allocation or scales to zero. Cloud Scheduler must call the reminder endpoint every minute; the app reads the manager's saved times and sends only when the configured Israel-time window is due. Firestore reminder locks make repeated calls idempotent.

## Configure Cloud Run

1. Deploy this app revision.
2. Copy the Cloud Run service URL and service name from the Cloud Run console.
3. Create a random secret locally in PowerShell:

   ```powershell
   $REMINDER_CRON_SECRET = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
   ```

4. Save it as a Cloud Run environment variable:

   ```powershell
   gcloud run services update SERVICE_NAME --region=REGION --update-env-vars "REMINDER_CRON_SECRET=$REMINDER_CRON_SECRET"
   ```

   Replace `SERVICE_NAME` and `REGION` with the deployed Cloud Run service values. Deploy/restart the revision after setting the variable.

## Create the one-minute Cloud Scheduler job

Enable the Cloud Scheduler API for the Google Cloud project, then create one HTTP job. Replace the project, region, service URL, and secret with your values:

```powershell
$PROJECT_ID = 'YOUR_GOOGLE_CLOUD_PROJECT_ID'
$REGION = 'YOUR_CLOUD_RUN_REGION'
$SERVICE_URL = 'https://YOUR_CLOUD_RUN_SERVICE_URL'

gcloud config set project $PROJECT_ID
gcloud services enable cloudscheduler.googleapis.com --project $PROJECT_ID
gcloud scheduler jobs create http alex-sms-reminders `
  --project=$PROJECT_ID `
  --location=$REGION `
  --schedule='* * * * *' `
  --time-zone='Asia/Jerusalem' `
  --uri="$SERVICE_URL/api/cron/reminders" `
  --http-method=POST `
  --headers="X-Reminder-Cron-Secret=$REMINDER_CRON_SECRET" `
  --attempt-deadline=120s `
  --max-retry-attempts=1
```

The endpoint rejects requests unless `REMINDER_CRON_SECRET` matches. Keep the secret in Cloud Run and Cloud Scheduler configuration; do not commit it to the project. Cloud Scheduler's HTTP job requires the target to be publicly reachable; the secret header protects this app endpoint.

In production, setting `REMINDER_CRON_SECRET` makes Cloud Scheduler the only active clock: in-process cron timers are disabled, and each external call reloads the current times from `settings/schedule_settings`. After deploying an updated version, route all service traffic to the latest revision so an older instance cannot continue using an earlier saved time. Later time changes made in the admin interface take effect on the next scheduler call.

When the job is active, the times and enable switches saved in the admin interface remain authoritative. A job run outside a configured reminder window does not send anything. See Google's [Cloud Scheduler HTTP job documentation](https://cloud.google.com/scheduler/docs/creating) and [Cloud Run billing settings](https://cloud.google.com/run/docs/configuring/billing-settings).
