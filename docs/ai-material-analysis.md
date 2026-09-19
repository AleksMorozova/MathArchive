# AI-assisted material creation

The administrator can start either the existing manual form or **Додати з AI**. AI analysis never creates a document. It returns editable suggestions; publication still uses `POST /api/admin/documents`, including the existing metadata, upload validation, and file lifecycle.

## Configuration

Set these backend environment variables locally or in Render:

```text
OpenAI__ApiKey
OpenAI__Model
OpenAI__AnalysisTimeoutSeconds=60
OpenAI__MaximumPagesToAnalyze=3
OpenAI__MonthlyWarningLimitUsd=5
OpenAI__BlockRequestsWhenLimitReached=false
OpenAI__TelemetryRetentionDays=365
OpenAI__Pricing__MODEL_NAME__InputPerMillionTokensUsd
OpenAI__Pricing__MODEL_NAME__OutputPerMillionTokensUsd
```

For a Render service using `OpenAI__Model=gpt-4o-mini`, the exact optional price overrides are `OpenAI__Pricing__gpt-4o-mini__InputPerMillionTokensUsd=0.15` and `OpenAI__Pricing__gpt-4o-mini__OutputPerMillionTokensUsd=0.60`. The checked-in JSON already provides these rates; set overrides only when rates change.

Do not commit the key. `appsettings.json` includes the standard text-token prices for `gpt-4o-mini` verified against the [official model pricing](https://developers.openai.com/api/docs/models/gpt-4o-mini) on 2026-09-15: USD 0.15 per million input tokens and USD 0.60 per million output tokens. The estimate uses the reported input and output token totals; cached-input discounts and other billing adjustments are not separately applied. Review these rates whenever OpenAI pricing changes. For a different model, set **both** rates using the exact model name, for example `OpenAI__Pricing__gpt-4o-mini-2024-07-18__InputPerMillionTokensUsd` and its `OutputPerMillionTokensUsd` partner. Render environment variables override JSON defaults. Restart the backend after changing them. Startup prints only the configured model name and whether pricing is available; it never prints the API key or rates. Unknown models or missing token counts retain `null` cost, displayed as **Не розраховано**.

The admin-only `POST /api/admin/ai-usage/recalculate-costs` recalculates existing rows with null estimated cost using stored model/input/output tokens and the **currently configured** prices. It makes no OpenAI request and does not overwrite priced rows. The response has `updated` and `skipped` counts; repeating it is safe. For example, after signing in and setting a backend admin JWT locally:

```powershell
$env:MATHARCHIVE_ADMIN_JWT = '<local-admin-jwt>'
Invoke-RestMethod -Method Post -Uri 'http://localhost:5293/api/admin/ai-usage/recalculate-costs' -Headers @{ Authorization = "Bearer $env:MATHARCHIVE_ADMIN_JWT" }
```

Do not use this endpoint to retroactively claim exact historical OpenAI billing: it estimates old token counts at the currently configured rates. No new database migration is needed for this pricing fix; the existing AI usage telemetry migration must already be applied.

The backend calls the Responses API with image/file input and strict JSON Schema output. It instructs the model to consider at most the configured number of informative pages. Suggested descriptions are natural Ukrainian plain text: one to three concise sentences, preferably 150–350 characters, summarizing only educational information supported by the material. They exclude unsupported facts and formats, exhaustive transcription, visual or OCR commentary, promotional language, direct address, Markdown, and other publication-inappropriate formatting. Visible authorship, names, initials, signatures, schools, organizations, copyright, social accounts, websites, watermarks, logos, and branding are also excluded. Audience references use Ukrainian school terminology such as **учні** or **школярі**; every grammatical form beginning with **студент** is prohibited. The application rejects a generated description containing that prohibited term or recognizable attribution or branding markers and leaves it empty for administrator review. The direct-file API does not physically split PDF or Office files before upload, so `MaximumPagesToAnalyze` limits model analysis rather than transmitted bytes. The normal 20 MB upload limit still applies.

## Local verification

1. Apply the `AddAiUsageTelemetry` migration to a local database.
2. Configure an admin account and the OpenAI settings above.
3. Start the API and frontend, sign in, and open `/admin/documents/ai`.
4. Select a supported file and confirm no request occurs until **Проаналізувати** is clicked.
5. Review or edit the generated title, topic, grade, material type, and description, then publish. Topic is ordinary document text: AI does not load or match a topic dictionary, and duplicate topic names are allowed.
6. Confirm the document appears in the catalog and inspect `/admin/ai-usage`.
7. Temporarily unset the API key to verify that failure retains the file and values and that manual creation remains available.

Telemetry stores only model, status, usage, duration, safe error metadata, request ID, estimated cost, and authenticated admin name. It never stores prompts, filenames, file content, base64, recognized text, API keys, full responses, or stack traces. `TelemetryRetentionDays` records the intended retention period; automatic deletion is deliberately deferred until the small single-admin project has enough volume to justify scheduled cleanup.
