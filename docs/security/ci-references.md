# CI metadata network policy

External OpenAPI references are disabled by default in both CLI input modes. Use a bundled Necto CI export for an offline catalog, or explicitly authorize each trusted metadata origin:

```sh
node tools/necto-run.mjs --scenario scenario.json --document openapi.yaml \
  --base-url https://api.example --allow-ref-origin https://schemas.example
```

`--allow-ref-origin` can be repeated. It grants network access to that exact HTTP(S) origin, including an internal service if explicitly selected; it is not a public-network-only filter. API base origins are not implicitly authorized. Reference responses never follow redirects or carry browser/managed credentials. Each response is capped at 5 MiB of actual bytes, the collection at 16 MiB, and the metadata phase shares one deadline (`--timeout`, default 30 seconds). These limits supplement the existing 32-document and YAML alias limits. Authorization to execute writes is checked before metadata fetching.

The browser's interactive document loading is unchanged. The runner's explicit base-origin restriction and write permission still apply to actual scenario requests.
