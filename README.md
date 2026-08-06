# MathArchive

MathArchive is a full-stack public website for educational mathematics materials. Visitors can browse, search, preview, and download documents. A single administrator can sign in to upload, edit, replace, and delete materials.

## Architecture

The repository is a monorepo:

- `backend/src/MathArchive.Domain` contains the `Document` entity and English enum names.
- `backend/src/MathArchive.Application` contains DTOs, validation, file-storage ports, and document use cases.
- `backend/src/MathArchive.Infrastructure` contains PostgreSQL EF Core persistence, migrations, local file storage, admin password hashing, JWT issuing, and development seed data.
- `backend/src/MathArchive.Api` exposes ASP.NET Core controllers, Swagger, JWT authentication, and ProblemDetails.
- `frontend/math-archive-web` contains the Vite React application with Ukrainian UI, Material UI, React Router, TanStack Query, React Hook Form, Zod, and Axios.

The MVP uses local file storage behind `IFileStorage`, so it can later be replaced by S3-compatible storage without changing controllers or UI code.

## Prerequisites

- .NET 9 SDK
- Node.js and npm
- Docker Desktop or another Docker Compose runtime
- PostgreSQL client tools are optional

## Start PostgreSQL

```powershell
docker compose up -d postgres
```

The default local database is:

```text
Host=localhost;Port=5432;Database=matharchive;Username=matharchive;Password=matharchive
```

## Administrator Configuration

Do not commit a real password or signing key.

Generate a password hash:

```powershell
dotnet run --project backend/src/MathArchive.Api -- hash-password "temporary-password"
```

Set local user secrets:

```powershell
dotnet user-secrets init --project backend/src/MathArchive.Api
dotnet user-secrets set "Admin:Username" "admin" --project backend/src/MathArchive.Api
dotnet user-secrets set "Admin:PasswordHash" "PASTE_HASH_HERE" --project backend/src/MathArchive.Api
dotnet user-secrets set "Jwt:SigningKey" "replace-with-a-long-random-development-key-at-least-32-characters" --project backend/src/MathArchive.Api
```

Environment variable equivalents:

```text
Admin__Username=admin
Admin__PasswordHash=PASTE_HASH_HERE
Jwt__SigningKey=replace-with-a-long-random-development-key-at-least-32-characters
ConnectionStrings__DefaultConnection=Host=localhost;Port=5432;Database=matharchive;Username=matharchive;Password=matharchive
FileStorage__RootPath=storage/documents
```

## Backend

Restore, build, and run:

```powershell
dotnet restore backend/MathArchive.sln
dotnet build backend/MathArchive.sln
dotnet run --project backend/src/MathArchive.Api
```

Swagger is available in development at:

```text
https://localhost:7000/swagger
```

Development seed data is applied on startup and creates sample PDF files in local storage when the database is empty.

## Migrations

The initial migration is included.

```powershell
dotnet ef database update --project backend/src/MathArchive.Infrastructure --startup-project backend/src/MathArchive.Api
dotnet ef migrations add MigrationName --project backend/src/MathArchive.Infrastructure --startup-project backend/src/MathArchive.Api
```

## Frontend

```powershell
cd frontend/math-archive-web
npm install
npm run dev
```

Optional API base URL:

```text
VITE_API_BASE_URL=http://localhost:5000
```

Routes:

- `/`
- `/materials`
- `/materials/:id`
- `/admin/login`
- `/admin/documents`
- `/admin/documents/new`
- `/admin/documents/:id/edit`

## Tests

```powershell
dotnet test backend/MathArchive.sln
cd frontend/math-archive-web
npm test
npm run build
```

## API Endpoints

Public:

- `GET /api/documents`
- `GET /api/documents/topics`
- `GET /api/documents/{id}`
- `GET /api/documents/{id}/download`

Admin:

- `POST /api/auth/login`
- `POST /api/admin/documents`
- `PUT /api/admin/documents/{id}`
- `DELETE /api/admin/documents/{id}`

## Security Notes

- Public browsing and downloads do not require authentication.
- Admin endpoints require a JWT with the `Admin` role.
- The admin password is stored only as a PBKDF2 hash.
- Uploaded files are stored outside the frontend directory.
- Physical file names are generated and never reuse the original file name.
- File size, extension, and MIME type are validated on the backend and frontend.

## MVP Limitations

- Only one administrator is supported.
- Local storage is used instead of S3-compatible storage.
- PDF and image preview is supported; Word and Excel files are download-only.
- There is no public registration, user profile system, or moderation workflow.
