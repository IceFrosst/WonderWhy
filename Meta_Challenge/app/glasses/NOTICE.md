# Third-party notices (glasses Web App)

Our own code is MIT ([LICENSE](../../../LICENSE)). These parts are not ours:

| What | Where | Licence | Note |
|---|---|---|---|
| App entry point and host rewrite rule | `src/main.tsx`, `vercel.json` | BSD (Meta's wearables Web App template). Copyright (c) Meta Platforms, Inc. and affiliates | Started from the template's files; the BSD licence text of the template applies to them |
| `@wearables-ui-toolkit/mrbd` | npm dependency, not vendored | Apache-2.0 | UI components for the Display |
| `react`, `react-dom` | npm dependency | MIT | |
| `vite`, `typescript`, `playwright`, `sharp` | dev dependencies | MIT / Apache-2.0 | Build and test only, not shipped |

Not used: `@wearables-ui-toolkit/icons` (Meta Developer Terms, not open source). It was removed on 14 Nov; do not add it back.

Meta's sample apps were read as reference only. No code was copied from them.
