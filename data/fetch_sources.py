#!/usr/bin/env python3
"""Fetch ignored raw inputs and verify the SHA-256 pins in sources.json."""
import argparse
import hashlib
import json
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
MANIFEST = HERE / "sources.json"


def load_sources(path=None):
    sources = json.loads((path or MANIFEST).read_text(encoding="utf-8"))
    ids, filenames = set(), set()
    for source in sources:
        filename = source["filename"]
        digest = source["sha256"]
        if Path(filename).name != filename or filename in {"", ".", ".."}:
            raise ValueError(f"Invalid source filename: {filename!r}")
        if len(digest) != 64 or any(c not in "0123456789abcdef" for c in digest):
            raise ValueError(f"Invalid SHA-256 for {filename}")
        if source["id"] in ids or filename in filenames:
            raise ValueError(f"Duplicate source: {source['id']} / {filename}")
        ids.add(source["id"])
        filenames.add(filename)
    return sources


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_source(source):
    path = HERE / "sources" / source["filename"]
    if not path.is_file():
        raise ValueError(f"Missing {path.name}; run python3 data/fetch_sources.py first.")
    actual = sha256(path)
    if actual != source["sha256"]:
        raise ValueError(f"SHA-256 mismatch for {path.name}: expected {source['sha256']}, got {actual}. Restore the pinned file or explicitly adopt new bytes with python3 data/fetch_sources.py --accept-new.")
    return path


def download(source, url):
    """Write to a temporary file; a mismatch must never replace local data."""
    directory = HERE / "sources"
    directory.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=directory, prefix=".fetch-", delete=False) as stream:
        temporary = Path(stream.name)
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Transit-Lab-source-fetcher/1.0"})
            with urllib.request.urlopen(request, timeout=45) as response:
                for block in iter(lambda: response.read(1024 * 1024), b""):
                    stream.write(block)
        except Exception:
            stream.close()
            temporary.unlink(missing_ok=True)
            raise
    try:
        if source.get("format") == "prg-geojson":
            data = json.loads(temporary.read_text(encoding="utf-8"))
            data["features"].sort(key=lambda feature: str(feature["properties"]["teryt"]))
            temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        return temporary
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def adopt(source, actual):
    print(f"Accepted {source['filename']}: {source['sha256']} -> {actual}")
    source["sha256"] = actual
    source["retrieved"] = date.today().isoformat()


def fetch(source, accept_new=False):
    destination = HERE / "sources" / source["filename"]
    generated = source.get("generatedBy")
    if generated:
        print(f"{source['filename']} is generated; run python3 {generated} to regenerate it, then python3 data/fetch_sources.py --accept-new to adopt the result.")
    if destination.is_file():
        actual = sha256(destination)
        if actual == source["sha256"]:
            print(f"Verified {destination.name}")
            return
        if accept_new:
            adopt(source, actual)
            return
        verify_source(source)
    # Generated JSON is not served by the operator's HTML timetable URL.
    urls = [] if generated else [source["url"]]
    if not accept_new and source.get("archiveUrl"):
        urls.append(source["archiveUrl"])
    for url in urls:
        temporary = None
        try:
            print(f"Fetching {destination.name} from {url}", flush=True)
            temporary = download(source, url)
            actual = sha256(temporary)
            if actual != source["sha256"] and not accept_new:
                print(f"SHA-256 mismatch for {destination.name}: expected {source['sha256']}, got {actual}.", file=sys.stderr)
                continue
            temporary.replace(destination)
            if accept_new:
                adopt(source, actual)
            else:
                print(f"Verified {destination.name}")
            return
        except (OSError, ValueError, KeyError, urllib.error.URLError) as error:
            print(f"Could not fetch {destination.name}: {error}", file=sys.stderr)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    raise ValueError(f"Pinned {destination.name} is unavailable from the configured sources. Publishers may have rotated the feed. Restore a local pinned copy or regenerate it as documented; use --accept-new only when you intend to record a new hash and retrieval date.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--accept-new", action="store_true", help="Explicitly record changed files' SHA-256 and today's date in sources.json.")
    args = parser.parse_args(argv)
    sources = load_sources()
    failures = []
    for source in sources:
        try:
            fetch(source, args.accept_new)
        except (OSError, ValueError) as error:
            failures.append(str(error))
            print(f"ERROR: {error}", file=sys.stderr)
    if args.accept_new:
        # Manifest updates are opt-in; normal fetching leaves it byte-identical.
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=HERE, prefix=".sources-", delete=False) as stream:
            json.dump(sources, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            temporary = Path(stream.name)
        temporary.replace(MANIFEST)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
