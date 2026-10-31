# FestOS frontend redesign prompt

Redesign the existing FestOS frontend as a coherent, professional festival operations workspace, using the attached design notes and screenshots as inspiration. Keep the current React architecture, routes, authentication, role permissions, API clients, and backend contracts. Do not replace the app or invent operational records.

## Visual direction
- Calm, high-contrast operations UI: deep navy navigation, light neutral work surfaces, restrained borders, consistent compact typography.
- Use dense, scannable tables for people and inventory; use a multiday, multi-venue time grid for scheduling; use a block and floor room rack for accommodation.
- Use semantic status color plus text labels. Avoid gradients, oversized cards, decorative charts, emoji icons, and filler copy.
- Preserve responsive behavior and accessible focus/keyboard interactions.

## Accommodation room availability
On the accommodation room view, let staff select a block and scan its floors. Render each API room as a compact tile showing room ID, floor, readiness, occupied beds, and available beds when supplied. Use distinct labeled states for available, partially occupied, full, needs attention, unavailable, and unknown. Never infer date-specific availability from capacity alone: if the API does not provide availability, show “—” and “Status not provided.” Include a clear legend, block filter, refresh action, and allocation records below the rack. Keep the overview, arrivals/departures, properties, and allocation preview connected to existing backend calls.

## Events, venues and scheduling
Keep these as separate sidebar destinations and independent pages. Events should focus on proposals and event records; Venues on facilities and constraints; Scheduling on the date/venue grid, conflicts, and publication actions. Connect each page to existing APIs and make controls perform real actions. Retain loading, empty, error, and permission states.

## Implementation
Inspect existing components, CSS tokens, routes, APIs, and role checks first. Reuse shared components. Make focused changes within existing pages and styles. Do not hardcode totals or fake records. Verify direct navigation and responsive layouts after implementation.
