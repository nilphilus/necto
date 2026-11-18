"""Capture the public FastEndpoints demo contract and synthetic tenant examples."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.error import URLError
from urllib.request import Request, urlopen


def capture(base, output):
    def get(path, tenant=None):
        headers = {"X-Tenant": tenant} if tenant else {}
        with urlopen(Request(base + path, headers=headers), timeout=5) as response:
            return json.load(response)

    for attempt in range(60):
        try:
            document = get("/openapi/v1.json")
            break
        except (URLError, TimeoutError):
            if attempt == 59:
                raise
            time.sleep(0.5)

    mappings = get("/necto/endpoint-mappings")
    if not document.get("openapi") or not document.get("paths") or not mappings:
        raise RuntimeError("The sample must expose an OpenAPI document and generated mappings.")

    tenants = {}
    for tenant in ("acme", "northstar"):
        tenants[tenant] = {
            resource: get(f"/{resource}", tenant)
            for resource in ("buildings", "customers", "assets")
        }
        tenants[tenant]["invoices"] = [
            get(f"/invoices/{invoice['id']}", tenant)
            for invoice in get("/invoices", tenant)
        ]

    output.mkdir(parents=True, exist_ok=True)
    for name, value in {
        "contract.json": {"document": document, "mappings": mappings},
        "seed.json": tenants,
    }.items():
        (output / name).write_text(json.dumps(value, ensure_ascii=False) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--assembly", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--port", type=int, default=5279)
    args = parser.parse_args()
    base = f"http://127.0.0.1:{args.port}"
    with tempfile.TemporaryFile() as log:
        with subprocess.Popen(
            ["dotnet", str(args.assembly.resolve()), "--urls", base,
             "--environment", "Development"],
            stdout=log, stderr=subprocess.STDOUT,
        ) as server:
            try:
                capture(base, args.output)
            except Exception:
                log.seek(0)
                print(log.read().decode(errors="replace"))
                raise
            finally:
                server.terminate()
                try:
                    server.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()


if __name__ == "__main__":
    main()
