#!/usr/bin/env python3
"""Create and verify a PostgreSQL custom-format backup without logging secrets."""

from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import time
import uuid


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--allow-empty-documents", action="store_true")
    parser.add_argument("--postgres-bin-dir", default="/usr/lib/postgresql/18/bin")
    parser.add_argument("--verification-image", default="postgres:18-alpine")
    return parser.parse_args()


def connection_environment(connection_string: str) -> tuple[list[str], dict[str, str], str]:
    environment = os.environ.copy()

    if connection_string.startswith(("postgresql://", "postgres://")):
        host_marker = connection_string.split("@", 1)[-1].split("/", 1)[0]
        return [f"--dbname={connection_string}"], environment, host_marker

    options: dict[str, str] = {}
    for item in connection_string.split(";"):
        if not item.strip():
            continue
        if "=" not in item:
            raise ValueError("Invalid Npgsql/.NET connection string format.")
        key, value = item.split("=", 1)
        options["".join(key.lower().split())] = value.strip()

    aliases = {
        "PGHOST": ("host", "server", "datasource"),
        "PGPORT": ("port",),
        "PGDATABASE": ("database", "initialcatalog"),
        "PGUSER": ("username", "userid", "user"),
        "PGPASSWORD": ("password",),
        "PGSSLMODE": ("sslmode",),
        "PGCHANNELBINDING": ("channelbinding",),
    }
    for variable, keys in aliases.items():
        value = next((options[key] for key in keys if key in options), None)
        if value:
            if variable == "PGSSLMODE":
                value = {"verifyca": "verify-ca", "verifyfull": "verify-full"}.get(
                    value.lower(), value.lower()
                )
            elif variable == "PGCHANNELBINDING":
                value = value.lower()
            environment[variable] = value

    missing = [name for name in ("PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD") if not environment.get(name)]
    if missing:
        raise ValueError(
            "Npgsql/.NET connection string is missing a required host, database, username, or password field."
        )

    return [], environment, environment["PGHOST"]


def run(command: list[str], *, environment: dict[str, str] | None = None, capture: bool = False) -> str:
    result = subprocess.run(
        command,
        check=True,
        env=environment,
        text=True,
        stdout=subprocess.PIPE if capture else None,
    )
    return result.stdout.strip() if capture else ""


def query_scalar(psql: str, connection_args: list[str], environment: dict[str, str], sql: str) -> str:
    return run(
        [psql, *connection_args, "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1", f"--command={sql}"],
        environment=environment,
        capture=True,
    )


def main() -> int:
    args = parse_args()
    connection_string = os.environ.get("DATABASE_CONNECTION_STRING", "").strip()
    if not connection_string:
        print("Required environment variable DATABASE_CONNECTION_STRING is not configured.", file=sys.stderr)
        return 1

    try:
        connection_args, environment, host_marker = connection_environment(connection_string)
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1

    pg_bin = Path(args.postgres_bin_dir)
    psql = str(pg_bin / "psql")
    pg_dump = str(pg_bin / "pg_dump")
    endpoint_fingerprint = hashlib.sha256(host_marker.encode("utf-8")).hexdigest()[:12]

    database_name = query_scalar(psql, connection_args, environment, "SELECT current_database();")
    database_role = query_scalar(psql, connection_args, environment, "SELECT current_user;")
    source_count_text = query_scalar(psql, connection_args, environment, "SELECT COUNT(*) FROM public.documents;")
    source_count = int(source_count_text)

    print(f"Source database: {database_name}")
    print(f"Source role: {database_role}")
    print(f"Source endpoint fingerprint: {endpoint_fingerprint}")
    print(f"Source documents count: {source_count}")

    if source_count == 0 and not args.allow_empty_documents:
        print(
            "Backup aborted: source public.documents is empty. Confirm that the connection targets the production Neon project and branch, or explicitly allow an empty backup.",
            file=sys.stderr,
        )
        return 1

    args.output.parent.mkdir(parents=True, exist_ok=True)
    try:
        run(
            [pg_dump, *connection_args, "--format=custom", f"--file={args.output}"],
            environment=environment,
        )
    except (OSError, subprocess.CalledProcessError):
        args.output.unlink(missing_ok=True)
        raise
    if not args.output.is_file() or args.output.stat().st_size == 0:
        args.output.unlink(missing_ok=True)
        print("Backup failed: dump file was not created or is empty.", file=sys.stderr)
        return 1

    container_name = f"matharchive-backup-verify-{uuid.uuid4().hex[:12]}"
    verification_password = uuid.uuid4().hex
    verification_succeeded = False
    try:
        run(
            [
                "docker", "run", "--detach", "--name", container_name,
                "--env", f"POSTGRES_PASSWORD={verification_password}",
                args.verification_image,
            ],
            capture=True,
        )
        for _ in range(30):
            readiness = subprocess.run(
                ["docker", "exec", container_name, "pg_isready", "--username=postgres"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            if readiness.returncode == 0:
                break
            time.sleep(1)
        else:
            raise RuntimeError("Temporary PostgreSQL verification container did not become ready.")

        run(["docker", "exec", container_name, "createdb", "--username=postgres", "backup_verification"])
        run(["docker", "cp", str(args.output), f"{container_name}:/tmp/backup.dump"])
        run(
            [
                "docker", "exec", container_name, "pg_restore", "--exit-on-error",
                "--no-owner", "--no-privileges", "--username=postgres",
                "--dbname=backup_verification", "/tmp/backup.dump",
            ]
        )
        restored_count = int(
            run(
                [
                    "docker", "exec", container_name, "psql", "--username=postgres",
                    "--dbname=backup_verification", "--no-align", "--tuples-only",
                    "--set=ON_ERROR_STOP=1", "--command=SELECT COUNT(*) FROM public.documents;",
                ],
                capture=True,
            )
        )
        print(f"Restored documents count: {restored_count}")
        if restored_count != source_count:
            raise RuntimeError(
                f"Backup verification failed: source count {source_count} does not match restored count {restored_count}."
            )
        verification_succeeded = True
    finally:
        subprocess.run(
            ["docker", "rm", "--force", container_name],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        if not verification_succeeded:
            args.output.unlink(missing_ok=True)

    print("Backup verification succeeded.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except subprocess.CalledProcessError as error:
        print(f"Backup command failed with exit code {error.returncode}.", file=sys.stderr)
        raise SystemExit(error.returncode) from None
    except (OSError, RuntimeError, ValueError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from None
