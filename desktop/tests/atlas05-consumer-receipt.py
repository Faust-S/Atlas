"""Describe the actual .iwxa exported by the installed Atlas Windows test.

The receipt is evidence about these bytes, not a claim that another IWXA
product accepts the Atlas portfolio profile.
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

PROFILE = "iwxa.atlas.portfolio"
PAYLOADS = (
    "content/objects.ndjson",
    "content/workspaces.ndjson",
    "schemas/iwxa.atlas.portfolio@1.0.0.json",
)
NAMES = {"manifest.json", *PAYLOADS}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def canonical(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False).encode("utf-8")


def one_record(data, label):
    lines = data.decode("utf-8").splitlines()
    require(len(lines) == 1, f"{label}: expected exactly one record")
    return json.loads(lines[0])


def inspect(archive):
    require(0 < archive.stat().st_size <= 32 * 1024 * 1024,
            "IWXA archive exceeds supported size")
    with zipfile.ZipFile(archive) as package:
        entries = package.infolist()
        require(len(entries) == len(NAMES) and
                {entry.filename for entry in entries} == NAMES,
                "IWXA ZIP has missing or unexpected entries")
        require(all(entry.compress_type == zipfile.ZIP_STORED and
                    not entry.flag_bits & 1 for entry in entries),
                "IWXA ZIP must have unencrypted, stored entries")
        manifest = json.loads(package.read("manifest.json"))
        require(manifest.get("format") == "iwxa.package" and
                manifest.get("format_version") == "1.0" and
                manifest.get("encryption") == "none", "Unsupported IWXA carrier")
        declared = manifest.get("files")
        require(isinstance(declared, list) and
                [row.get("path") for row in declared if isinstance(row, dict)] == list(PAYLOADS) and
                len(declared) == len(PAYLOADS), "IWXA manifest file list differs")
        digest_lines = []
        for row in declared:
            payload = package.read(row["path"])
            actual_hash = sha256(payload)
            require(row.get("size") == len(payload) and row.get("sha256") == actual_hash,
                    f"IWXA payload differs from manifest: {row['path']}")
            digest_lines.append(f"{row['path']}\t{actual_hash}\n")
        require(manifest.get("package_digest") == sha256("".join(digest_lines).encode("utf-8")),
                "IWXA package digest mismatch")
        obj = one_record(package.read("content/objects.ndjson"), "portfolio")
        require(obj.get("schema_id") == PROFILE and obj.get("schema_version") == "1.0.0",
                "Unexpected IWXA consumer profile")
        require(manifest.get("semantic_digest") == sha256(canonical(obj["data"])),
                "IWXA portfolio semantic digest mismatch")
        snapshot = obj["data"]["snapshot"]
        require(snapshot.get("schema") == "atlas.project/1", "Unexpected Atlas snapshot schema")
        projects = snapshot.get("projects")
        require(isinstance(projects, list) and
                all(isinstance(project, dict) and isinstance(project.get("items"), list)
                    for project in projects), "Invalid Atlas project or work collection")
        project_count = len(projects)
        work_count = sum(len(project["items"]) for project in projects)
        require(project_count == 120 and work_count >= 1200,
                "Installed Atlas qualification portfolio is incomplete")
        require(isinstance(snapshot.get("revision"), int) and snapshot["revision"] >= 0,
                "Invalid Atlas snapshot revision")
        return project_count, work_count, snapshot["revision"]


def create_receipt(archive, receipt, commit):
    require(re.fullmatch(r"[a-fA-F0-9]{40}", commit) is not None,
            "Missing exact source commit")
    projects, works, revision = inspect(archive)
    checksum = sha256(archive.read_bytes())
    content = "\n".join((
        "source=installed Atlas 0.5 Windows qualification",
        f"source_commit={commit.lower()}",
        f"data=synthetic fixture: {projects} projects and {works} works",
        f"projects={projects}",
        f"works={works}",
        f"portfolio_revision={revision}",
        "carrier=iwxa.package/1.0",
        "profile=iwxa.atlas.portfolio/1.0.0",
        "profile_status=consumer-local-pending-owner",
        "cross_product_import=NOT_QUALIFIED",
        f"sha256={checksum}",
    )) + "\n"
    receipt.write_text(content, encoding="utf-8", newline="\n")
    print(f"ATLAS05_IWXA_CONSUMER_SAMPLE_READY_PASS sha256={checksum} "
          f"projects={projects} works={works}", flush=True)


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit("Usage: atlas05-consumer-receipt.py ARCHIVE RECEIPT SOURCE_COMMIT")
    try:
        create_receipt(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3])
    except (OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile,
            UnicodeError, json.JSONDecodeError) as error:
        sys.exit(f"ATLAS05_IWXA_CONSUMER_SAMPLE_HOLD: {error}")
