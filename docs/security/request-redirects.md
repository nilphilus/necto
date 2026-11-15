# API request redirects

All API requests reject redirects, including anonymous operations and requests using manual headers or presets. This prevents a custom API-key header or request body from reaching another origin through a redirect. Use the API's final URL as the configured server instead. The rule applies in the API transport as well as authentication planning; setting `redirect: follow` on a draft does not bypass it.

Metadata reference fetching has a separate policy and is not changed here.

Regression checks cover anonymous/security alternatives and a real cross-origin 307 with a manual key and POST body; the destination receives no request.
