# GUI Architecture

The GUI is organized by Electron process boundary first, then by renderer feature.

## Process Layers

- `main-process/` — Electron main process boot, window creation, IPC registration, and runtime lifecycle hosting.
- `preload/` — Context-isolated renderer bridge exposed as `window.microcode`.
- `runtime/` — GUI adapter around the Microcode agent runtime, session state, MCP, permissions, and swarm supervisor.
- `shared/` — Types shared across main, preload, runtime, and renderer.

## Renderer Layers

- `renderer/main.ts` — Browser bootstrap only.
- `renderer/app/` — Application shell and app-level view state.
- `renderer/layout/` — Persistent layout surfaces such as sidebar and status bar.
- `renderer/features/` — User-facing feature modules:
  - `composer/` — prompt input, attachments, slash menu interaction.
  - `command-palette/` — command palette overlay.
  - `settings/` — settings and API configuration panels.
  - `timeline/` — chat transcript items, tool output, command results, permissions, and agent activity.
- `renderer/components/` — Reusable presentational components with no product-specific workflow state.
- `renderer/commands/` — Slash command catalog and descriptions.
- `renderer/lib/` — Small renderer-only utilities.
- `renderer/styles.css` — Legacy/base theme stylesheet.
- `renderer/styles/overrides.css` — Final cascade fixes loaded after the base stylesheet.

Keep new UI work inside the closest feature folder. Add shared components only after at least two features need the same component.
