# RectoBoost Dashboard Design

Static dashboard reference for dev handoff.

## Files

- `index.html` contains the full homepage/dashboard layout, component markup, CSS tokens, responsive states, hero illustration, chart, sidebar, topbar, cards, recent orders, and announcement bar.
- `assets/rectoboost-logo.png` is the confirmed RectoBoost logo asset used in the sidebar.
- `assets/hero-abstract-bg.png` is the generated abstract hero background used on the right side of the hero.
- `assets/user-avatar.svg` is the placeholder user avatar used in the top bar.

## Implementation Notes

- The page is dependency-free and can be opened directly in a browser.
- Main design tokens are defined in `:root` for color, radius, border, shadow, and text values.
- Platform icons are inline SVG symbols in `index.html`, so the dev team can convert them into icon components without external requests.
- Suggested component split: `Sidebar`, `Topbar`, `HeroPanel`, `WalletCard`, `QuickOrderCard`, `LevelCard`, `StatisticsPanel`, `RecentOrders`, and `AnnouncementBar`.
- Desktop layout follows the supplied homepage screenshot closely. Mobile stacks the sidebar navigation, cards, chart, and order list.

## Visual Direction

- Background: near-black dashboard shell with blue radial lighting.
- Panels: dark navy gradient cards with subtle blue borders.
- Primary action: electric blue gradient.
- Accent colors: RectoBoost blue/orange, green status chips, orange processing chip, blue in-progress chip.
