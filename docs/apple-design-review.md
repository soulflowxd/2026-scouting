# Design review: 2026 Scouting

Reviewed October 8, 2026 using the apple-design skill. Scope: the React website on phones and laptops, including authentication, the app shell, Teams, pit and match scouting, Strategy board, Pick lists, Rank teams, Account, Administration, Event setup, and recovery pages.

## Summary

Assessment: **Good after targeted improvements**, not a claim of full accessibility certification. The largest issues were undersized mobile controls, inconsistent form hierarchy, unnecessary mobile scrolling, and weak keyboard/recovery affordances. Fixes use the existing React components and semantic theme rather than changing scouting workflows or making the web app imitate a native app.

## Critical issues addressed

### Mobile input and interaction sizing

- What: compact shared controls and small input text made phone interaction harder and could trigger Safari input zoom.
- Why: Design Guideline — Accessibility: provide comfortably sized interaction targets and legible, adaptable text. Entering data: make input convenient and clearly labeled.
- Fix: shared phone/coarse-pointer button, menu, select and text-input minimum heights are 44 CSS pixels; mobile inputs use at least 16px text. Numeric steppers expose numeric bounds and disable unavailable decrement/increment actions. This is a web adaptation of the mobile target-size guidance, not a blanket assertion about every custom SVG target.

### Keyboard access and input context

- What: drawing required pointer input; several notes fields relied on placeholders; search fields lacked explicit accessible names.
- Why: Design Guideline — Accessibility: provide alternatives to gestures and meaningful labels. Entering data: preserve context while a person types.
- Fix: field drawing supports arrow-key positioning and Enter/Space to add points, with screen-reader instructions and a visible keyboard cursor. Match notes have persistent labels, searches have accessible names, selection buttons expose pressed state, and the shell includes a skip-to-content link and visible focus styling.

### Modal fit and recovery

- What: shared dialogs needed a viewport-height limit and predictable scrolling; route failures exposed the default developer error screen.
- Why: Design Guideline — Modality: keep modal content reachable and dismissal clear. Accessibility/Layout: respect available space and safe areas; communicate status and recovery.
- Fix: normal dialogs and sheets constrain height, scroll internally, account for safe-area insets and reserve space for close controls. Field full-screen views explicitly retain full viewport sizing. Route errors now offer reload and a safe Teams link; authentication loading has readable status text.

## Improvements implemented

- **Typography:** platform system fonts, consistent sentence-case headings, relaxed line height and clearer section titles. Design Guideline — Typography: use a consistent hierarchy and readable system typography.
- **Color:** neutral grouped light surfaces, semantic accent/primary colors, theme-aware pick-list actions and focus rings, and a selected appearance radio item. Design Guideline — Color > Best practices: use color consistently and adapt appearance without changing meaning.
- **Motion and contrast preferences:** reduced-motion overrides and stronger borders/secondary text for increased-contrast preferences. Design Guideline — Accessibility: respect system accessibility preferences.
- **Mobile information density:** Teams cards keep EPA, xP and RP prominent while secondary details use compact rows; match-card metrics wrap instead of clipping; the pit map fits its container at default zoom. Design Guideline — Layout: emphasize important content and adapt to smaller available space.
- **Strategy board:** phone team selectors use two columns instead of six full-width rows, bringing the field closer to the top. Driver-station labels, path colors and square robot markers remain intact.
- **Forms:** consistent section spacing and larger primary actions, readable inline sign-in errors, unchanged autofill and password guidance. Design Guideline — Entering data: provide clear labels, feedback and appropriate controls.
- **Navigation:** short event context, labeled desktop navigation, accessible drawer controls, profile-based account/appearance tools, and admin-only Event setup navigation. Existing scouting alerts remain visible.

## Positive notes and deliberate trade-offs

- Rank Teams already places Pick controls before bounded photo previews; this was preserved.
- Desktop Pick lists retains its original full-width layout at 768px and above. Only shared styling changes apply there; the compact landing layout stays mobile-only.
- The existing mobile drawer remains appropriate for the number of destinations. This review did not replace it with an overcrowded bottom bar.
- Native selects, browser autofill, existing React/Base UI primitives, text labels and Lucide icons are retained.
- Team branding, event aliases, official results, report validation, assignment rules, notifications and permissions were not redesigned or weakened.

## Verification and limitations

- Visually checked signed-out authentication and all top-level signed-in routes locally; checked mobile scouting forms and the full-screen field without submitting reports or casting votes.
- Viewports included 390×844, a narrow 320×568 phone, 844×390 landscape, and a 1366×768 laptop. The narrow Teams page had no horizontal document overflow; its inputs/selects measured 44px high with 16px text.
- Checked light and dark appearance, the preserved laptop Pick lists layout, compact loaded Rank Teams cards, and the landscape field dialog at full 844×390 viewport size.
- Production build passes. All 82 tests pass, including five new presentation/accessibility regression tests. Lint has no errors and four existing generated-file warnings.
- Real iPhone Safari, VoiceOver, Android TalkBack, hardware keyboards, browser text zoom, every permission/account state, and all content-dependent color combinations still need device-level testing. Viewport emulation does not certify those behaviors.
- No deployment, backend data mutation, report submission, account change or vote was performed for this design review. Existing unrelated work was preserved.

## Guideline references

The skill's bundled guidance was read for Accessibility, Color, Layout, Typography, Entering data and Modality. Relevant Apple HIG topics: [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Color](https://developer.apple.com/design/human-interface-guidelines/color), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Entering data](https://developer.apple.com/design/human-interface-guidelines/entering-data), and [Modality](https://developer.apple.com/design/human-interface-guidelines/modality). Recommendations above are paraphrased and adapted to a responsive website.
