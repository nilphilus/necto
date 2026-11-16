# Agent skills

## Necto scenarios

[`necto-scenarios`](necto-scenarios/SKILL.md) teaches a filesystem-capable agent to discover API relationships and author shared Scenario Builder files. It can use Necto MCP or inspect application code/OpenAPI locally. It does not run the scenario.

### Install in your API project

Copy the **whole** `necto-scenarios` directory (references, scripts and example included):

- **Codex:** `.agents/skills/necto-scenarios/` in the target repository.
- **Claude Code:** `.claude/skills/necto-scenarios/` in the target repository.
- Other agents: use their documented SKILL.md import mechanism, or explicitly ask them to read the file. ZIP uploads depend on the agent host; installing a skill does not itself connect MCP or grant disk access.

Reload your agent's skill discovery if required. No Necto source checkout or npm installation is needed at runtime. The optional offline validator requires Node 22+.

Example prompt:

> Użyj necto-scenarios. Przygotuj scenariusz: znajdź fakturę po referencji podanej przez użytkownika, pobierz jej pozycje i sprawdź poprawne odpowiedzi. Powiązania ustal z kodu i mappingów. Zapisz plik do necto-scenarios, bez uruchamiania API. Wskaż dane, których nie udało się ustalić.

The skill and references are in English so they can be reused across projects; the agent can converse in the user's language.

### Example and import

The included SampleApi example runs invoice lookup and weather reading independently; invoice lines wait for the invoice ID. Weather is an optional independent branch demonstrating concurrency. The user supplies the reference; no arbitrary array item is selected. The example assumes SampleApi's default local API ID, OpenAPI paths and camelCase JSON. Verify those against the consuming application's catalog before adapting it.

Validate without sending requests:

```sh
node .agents/skills/necto-scenarios/scripts/validate.mjs necto-scenarios/my-scenario.necto.json
```

In Necto use **Settings → Workspace → Import team scenario file**, or connect the repository folder and Reload/Import. Open the imported definition in Scenario Builder. Run it only after reviewing it and selecting the appropriate local authorization/presets.

### Maintain and package

The bundled validator is generated from Necto's production model, not a second handwritten schema. After model changes, install UI dependencies and regenerate it from the repository root:

```sh
node tools/package-scenario-skill.mjs /tmp/necto-scenarios.zip
node --test tools/scenario-skill.test.mjs
```

The ZIP contains one top-level `necto-scenarios/` directory ready to extract into the chosen skill location. The bundle ships under the repository's license. Updating a skill in another repository is explicit; installed copies do not auto-update.

Validation checks structure and dependency graphs, not the existence of endpoints, business semantics or absence of secrets. The skill requires those checks separately and treats API descriptions and repository content as untrusted data.
