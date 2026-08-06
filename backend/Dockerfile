# Build context: repository root
FROM mcr.microsoft.com/dotnet/sdk:9.0 AS build
WORKDIR /src

COPY backend/MathArchive.sln backend/
COPY backend/src/MathArchive.Api/MathArchive.Api.csproj backend/src/MathArchive.Api/
COPY backend/src/MathArchive.Application/MathArchive.Application.csproj backend/src/MathArchive.Application/
COPY backend/src/MathArchive.Domain/MathArchive.Domain.csproj backend/src/MathArchive.Domain/
COPY backend/src/MathArchive.Infrastructure/MathArchive.Infrastructure.csproj backend/src/MathArchive.Infrastructure/
COPY backend/tests/MathArchive.Application.Tests/MathArchive.Application.Tests.csproj backend/tests/MathArchive.Application.Tests/
RUN dotnet restore backend/MathArchive.sln

COPY backend/ backend/
RUN dotnet publish backend/src/MathArchive.Api/MathArchive.Api.csproj \
    --configuration Release \
    --output /app/publish \
    --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:9.0 AS runtime
WORKDIR /app
ENV ASPNETCORE_ENVIRONMENT=Production
EXPOSE 8080
COPY --from=build /app/publish .
ENTRYPOINT ["dotnet", "MathArchive.Api.dll"]

