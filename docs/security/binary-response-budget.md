# Binary response budgets

The request response budget now applies to binary downloads as well as text. Both paths count actual streamed bytes and cancel reception when the configured budget is exceeded; Content-Length is only progress information. No partial Blob is exposed after a limit error or cancellation. Files within the budget retain their bytes and Content-Type.

The existing response-budget setting (default 32 MiB) and explicit retry flow are unchanged. This bounds bytes received per response, not total browser memory, which also includes the final Blob and other application state.
