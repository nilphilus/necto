# Shared scenario folder — security review

Scope: PR #112, reviewed against commit `313bf1f8de67f1acce8f42ef0e0442debfd59498`. This is a focused source review and automated adversarial testing of browser folder sharing, not a full application penetration test.

## Findings and fixes

| Priority | Problem before the fix | Resolution |
| --- | --- | --- |
| P1 | Custom OpenAPI API-key names could bypass name-based credential removal. | Declared header/query API keys and sensitive parameters are excluded; static variables feeding sensitive inputs become human inputs in the shared copy. |
| P1 | Response checks, wait conditions and object selectors could export sensitive expected values. | Literal comparisons are checked against the relevant response schema and sensitive names. Sharing fails without echoing the value; conditions are never silently weakened. Unused expectations on existence checks are removed. |
| P1 | URL fragments could retain OAuth tokens such as `#access_token=…`. | Recognized credential fragments are removed along with URL userinfo and sensitive query parameters. Ordinary URLs remain unchanged. |
| P2 | Byte limits alone allowed deeply nested JSON and parse errors could expose file text. | Outer and embedded JSON have structural limits (25,000 values, 64 levels); invalid outer JSON receives a generic error. |
| P2 | A replaced filename could refer to a different file between conflict checks. | Verify native handle identity and content around the staged write; abort if either changes. Reject path separators, control characters and alternate-stream syntax in managed basenames. |

A synthetic reproduction against the original implementation confirmed all three secret channels: custom API-key input, sensitive comparison and OAuth fragment. It also confirmed acceptance of deeply nested unused metadata. Regression tests now cover these cases.

## Verification

- All 326 UI module tests pass, including eight new security tests.
- The existing folder browser flow passes with real native file handles in Chromium’s private filesystem.
- A dedicated hostile-input browser test confirms: sensitive comparison export fails before writing, malformed/deep files are rejected, parse errors do not echo secrets, imported HTML-like names remain text, prototype keys do not pollute objects, and importing does not execute API requests.
- UI production build and .NET 10 solution build pass; the solution reports zero warnings and errors.

Run the browser checks with the project’s Playwright environment:

```sh
node Necto.UI/tests/scenario-folder.e2e.cjs
node Necto.UI/tests/scenario-folder-security.e2e.cjs
```

## Remaining boundaries

- Arbitrary business data, unmarked secrets and free-text payloads cannot be reliably classified. Review files before committing; export filtering is not a general secret scanner.
- File checks are optimistic. Browser APIs cannot make the final check and commit atomic with external Git/OS writers. Avoid concurrent checkout or modification while saving.
- Tests exercise native handles in a browser-private filesystem. They do not automate the OS picker, audit OS symlink behavior or validate every browser/platform permission implementation.
- Folder access is granted to the Necto browser origin. Use a trusted deployment and grant only the intended team directory. No filesystem service is exposed by this feature on the ASP.NET server.
