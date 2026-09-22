# Streamline Freehand catalog import

The bundled archive contains 1,000 CC BY 4.0 SVG icons. See
[the attribution notice](data/STREAMLINE-NOTICE.md). It is used only to seed
ExcaliDash's per-user asset catalog; web and CLI clients retrieve SVGs from
the server after import.

Run a dry check first:

```sh
python3 tools/import_streamline_assets.py --dry-run
```

Import with an API key belonging to the target account and scoped to
`assets:write`:

```sh
python3 tools/import_streamline_assets.py \
  --base-url https://draw.timesletter.com \
  --key-file ~/.config/excalidash/asset-api-key
```

The key file must be readable only by its owner (`0600`). The script sends
up to 50 SVGs per request, verifies each batch count, and can be rerun: the
server skips unchanged `(source, name)` entries. The import endpoint validates
all SVGs in a batch before committing any of them. Chinese aliases are generated
from a checked term glossary; all 1,000 entries have at least one Chinese term,
but the aliases are search aids rather than full professional translations.
