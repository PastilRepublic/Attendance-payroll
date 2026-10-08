# UI guide

How every screen in this app should look and feel. Follow it for anything new, and when you touch an
existing screen, move it toward this. The reference screenshots are in `docs/ui-reference/`
(`forms-and-summary.png`, `finance-overview.png`, `finance-records.png`) — look at them before building.

**The feel:** easy and friendly. Big, clear buttons and text. Soft colors that mean something. Lots of
breathing room. A shop owner or an employee on a phone should know what to tap without reading
instructions.

## Principles

1. **One obvious next step.** Each card or section has one primary action; everything else is quieter.
2. **Big and clear.** Body text is never smaller than `text-sm`; labels sit above fields; buttons are
   at least 40px tall (`py-2.5`), and 44px+ on the kiosk and anything used on a phone.
3. **Color means something.** Green = money in / good, amber = fees / needs a look, red = money out /
   problem, dark = the bottom line. Never use color just for decoration.
4. **Soft, rounded, roomy.** Big radii, thin borders, generous padding. No harsh shadows, no cramped
   tables-in-tables.
5. **Say it plainly.** Short labels, a one-line muted description under each section title, and a
   friendly empty state ("No finance records for this month yet.") instead of a blank area.
6. **Show the problem where it happened.** Errors appear under the form (use `ActionForm`), in plain
   words, never a blank error page.

## Foundations

**Page:** background `bg-slate-50` with a hint of blue (`#f4f7fb` is the target); content is a centered
column with `px-4 sm:px-6` and `space-y-6` between sections.

**Font:** the app's sans (Geist). Titles `font-semibold`/medium weight, not heavy; numbers that matter
are `font-extrabold`. Secondary text is `text-slate-500`; the main text is `text-slate-900`.

| Use | Classes |
| --- | --- |
| Page title | `text-2xl font-bold tracking-tight text-slate-900` |
| Card title | `text-lg font-medium text-slate-900` |
| Card description | `text-sm text-slate-500` (right under the title) |
| Field label | `text-sm font-medium text-slate-800` (above the field) |
| Small label (e.g. GROSS) | `text-xs uppercase tracking-wide text-slate-500` |
| Big number | `text-3xl font-extrabold` |
| Footnote / disclaimer | `text-xs text-slate-400` |

**Colors** (Tailwind classes; the cyan `accent-*` shades are defined in `src/app/globals.css`):

| Role | Look |
| --- | --- |
| Primary action (the one main button) | teal: `bg-accent-800 text-white hover:bg-accent-900` |
| Strong action / dark pill | `bg-slate-900 text-white hover:bg-slate-800` |
| Secondary action | `bg-slate-100 border border-slate-300 text-slate-800 hover:bg-slate-200` |
| Highlight banner | `bg-accent-50 border border-accent-200` with `text-accent-950` / `text-accent-800` |
| Money in / good | tint `bg-emerald-50`, text `text-emerald-800` / `text-emerald-950` |
| Fees / attention | tint `bg-amber-50`, text `text-amber-800` / `text-amber-950` |
| Money out / problem | tint `bg-rose-50`, text `text-rose-800` / `text-rose-950` |
| Bottom line / total | `bg-slate-950 text-white` (label `text-slate-300`) |
| Neutral tile | `bg-slate-50` |

**Shape:** cards `rounded-3xl`, tiles and inner cards `rounded-2xl`, icon chips `rounded-xl`,
buttons and select/date fields `rounded-full`. Borders are thin (`border border-slate-300`, or
`border-slate-900/80` on the big white cards in the references). Padding: cards `p-6 sm:p-8`, tiles
`p-5`. Gaps between things: `gap-4` to `gap-6`.

## Building blocks

**App header** (every page): white, soft shadow, sticky. Left: a dark rounded-square logo chip
(`PR`, yellow text) + business name in semibold + a small muted subtitle. Right: a pill switcher
(`Employee | Admin`) where the active one is a dark pill.

**Card:** `rounded-3xl bg-white border border-slate-300 p-6 sm:p-8`. Title, then the muted one-line
description, then the content with `mt-5`. Optional icon chip above the title: a 48px `rounded-xl`
square tinted to match the topic (blue = forms, red = warning, green = approval) with a matching icon.

**Buttons** — always pill-shaped (`rounded-full`), medium weight, with a small icon before the label
when one helps:
- Primary: teal, one per card/section (Add daily sales, Save).
- Dark: for the strongest print/confirm action next to a form (Print summary).
- Secondary: light grey-blue with a border (Export, Add expense, Print form). Full-width inside a
  card when it's the card's only action.
- Destructive: `bg-rose-50 text-rose-700` (never a bright red fill).
- Size: `px-5 py-2.5 text-sm` normal; `px-3 py-1.5 text-xs` only inside dense rows.
- While saving, the button is disabled (`ActionForm` does this).

**Fields:** `rounded-full` selects and date inputs with a light fill (`bg-slate-100`), `border
border-slate-300`, `px-4 py-2.5 text-sm`; label above in `font-medium`. Text areas are
`rounded-2xl`. Put related fields in one row on wide screens (`grid gap-4 sm:grid-cols-3`) and stack on
phones. Errors under the form in `text-xs text-red-600`.

**Stat tiles:** a row of `grid gap-4 sm:grid-cols-2 lg:grid-cols-4`. Each tile `rounded-2xl p-5` in its
meaning color, a small icon, a small label, then the big number. The bottom-line tile is the dark one.

**Section inside a card:** a heading + muted line, then a grid of smaller bordered cards
(`rounded-2xl border border-slate-300 p-4`) — small uppercase label, big number, small muted detail.

**Highlight banner:** `rounded-3xl bg-accent-50 border border-accent-200 p-6` with a title, a
one-line explanation, and the control (e.g. the month picker) on the right.

**Empty state:** a dashed box (`rounded-2xl border border-dashed border-slate-300 p-10 text-center
text-slate-500`) with one friendly sentence.

**Lists and tables:** inside a card, rows separated by `divide-y divide-slate-100`, comfortable
`py-3` row height; money right-aligned. On phones prefer stacked rows over wide tables.

**Footnotes:** a short muted line at the bottom of a page when something needs clarifying.

## Words

- Plain English, short. Where staff are Filipino-speaking and it helps (forms staff fill in or read),
  add the Filipino next to the English like the references do: `Start / Simula`, `End / Wakas`,
  `Employee / Empleyado`. Keep admin/finance screens English unless asked.
- Money always `₱1,234.00`. Dates like `Oct 8, 2026`; times `8:00 AM`.

## Rules for building

- Reuse the shared components in `src/components/` (`Card`, `Button`, `PageHeader`, `Badge`,
  `ActionForm`, …). If the guide needs something they don't do, **update the component** rather than
  restyling one screen, so the whole app moves together.
- Forms that can fail use `ActionForm` + a `…Form` server action (see `src/lib/formAction.ts`).
- Check every new screen at phone width (≈340px) and desktop. No horizontal page scroll; tables scroll
  inside their card.
- Don't add new colors, radii or shadows that aren't described here without asking.
