# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy solution and project files
COPY Ours.slnx ./
COPY Ours.Api/Ours.Api.csproj Ours.Api/
COPY Ours.Application/Ours.Application.csproj Ours.Application/
COPY Ours.Domain/Ours.Domain.csproj Ours.Domain/
COPY Ours.Infrastructure/Ours.Infrastructure.csproj Ours.Infrastructure/

# Restore dependencies
RUN dotnet restore Ours.Api/Ours.Api.csproj

# Copy source code
COPY Ours.Api/ Ours.Api/
COPY Ours.Application/ Ours.Application/
COPY Ours.Domain/ Ours.Domain/
COPY Ours.Infrastructure/ Ours.Infrastructure/

# Publish API
RUN dotnet publish Ours.Api/Ours.Api.csproj \
    -c Release \
    -o /app/publish \
    --no-restore

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS final
WORKDIR /app

COPY --from=build /app/publish .

# Render provides the PORT environment variable
ENV ASPNETCORE_URLS=http://0.0.0.0:${PORT}

ENTRYPOINT ["dotnet", "Ours.Api.dll"]
