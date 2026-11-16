# Expand response children

In **Response → Preview**, use **Expand children** to open nested objects and lists together. **Collapse children** closes the descendants while leaving the response root open.

- Paging stays active. Only the visible page of each collection is expanded; moving to another page expands that page's children too.
- Bulk expansion is bounded to 500 JSON values and 16 levels. If some branches remain collapsed, the preview explains this; individual expansion and Find remain available.
- A new response restores the existing default expansion rules. Raw/Preview switching preserves the toggle for the current response.
- The control is available in the normal and expanded scenario response preview. XML retains its existing controls.

![Expanded nested invoice lists](images/expanded-children.png)

Validation: 293 UI/module tests, production UI build, and Chromium checks for nested lists, later pages, search reveal, mode switching, response reset, mobile layout and a payload with 250,000 nested rows. Existing XML and expanded-response browser regressions passed.

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node Necto.UI/tests/preview-expansion.e2e.cjs
```

Build the UI first. Set `NECTO_EXPANSION_SCREENSHOTS` to save a preview.
