# Self-hosted font licenses

Per frontend-screens.md §6.1 / R9: fonts are self-hosted `woff2` under this
directory. No Google Fonts / Fontshare CDN link is loaded at runtime — these
files were fetched once at build time from each foundry's own distribution
API and are committed here.

| File | Family | Source | License |
|---|---|---|---|
| `Fraunces-Variable.woff2` | Fraunces (variable: opsz, wght, SOFT, WONK) | fonts.google.com/specimen/Fraunces (Undercase Type / Google Fonts) | SIL Open Font License 1.1 |
| `IBMPlexMono-Regular.woff2` | IBM Plex Mono, weight 400 | fonts.google.com/specimen/IBM+Plex+Mono (IBM) | SIL Open Font License 1.1 |
| `IBMPlexMono-Medium.woff2` | IBM Plex Mono, weight 500 | fonts.google.com/specimen/IBM+Plex+Mono (IBM) | SIL Open Font License 1.1 |
| `GeneralSans-Regular.woff2` | General Sans, weight 400 | fontshare.com/fonts/general-sans (Indian Type Foundry / Fontshare) | Fontshare Free License |
| `GeneralSans-Medium.woff2` | General Sans, weight 500 | fontshare.com/fonts/general-sans (Indian Type Foundry / Fontshare) | Fontshare Free License |
| `GeneralSans-Semibold.woff2` | General Sans, weight 600 | fontshare.com/fonts/general-sans (Indian Type Foundry / Fontshare) | Fontshare Free License |

Full license text lives with each foundry — OFL 1.1: https://openfontlicense.org/,
Fontshare Free License: https://www.fontshare.com/licenses/flf. Both permit
bundling and self-hosting in an application; neither requires attribution in
the shipped product, but it's given here for provenance.

DECISION: IBM Plex Mono has no published variable-font cut on Google Fonts,
so §6.2's `--t-data-m` weight 450 is served by the 500 (Medium) static face
rather than a true 450 instance — the two are visually indistinguishable at
the sizes this system uses mono for (11–20px).
