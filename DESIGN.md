# Mobile scouting design context

The app is used at events while scouts watch matches and walk the pits. Phone
screens should keep the next action visible, with 44px or larger touch targets
and secondary information behind a tap. Keep desktop layouts at responsive
breakpoints.

## Live match report

The visual reference is 9483's dark match tracker. Keep the timer and current
phase compact above the actions. The first action row has wide Scoring and
Passing tiles; the middle has Climbing, Idle, and Defending; the third has wide
Traveling and Intaking. Stealing sits below those seven reference actions.
Button height follows tile width, so the grid retains large, near-square
middle tiles on phones. Use colored outlines and a solid fill while a tile is
held. Recording begins on press and ends on release. Keep the segment timeline
directly below the buttons with the elapsed position and recent activities.
The selected robot's alliance and its own hub status remain visible.

The Matches schedule has a single search input above the match rows. Plain
numbers match QM numbers or either alliance's team numbers. `QM`/`Q` prefixes
limit search to matches; `team`/`t` prefixes limit it to team numbers. Filtering
does not change assignment ownership or which report a scout may open. Show a
result count and a clear empty state when nothing matches.

## Pit scouting and Rank Teams

Put team search before pit results. Search number, event alias, nickname, and
pit location. On mobile, open the Nexus floor plan in a dialog; keep it inline
on larger screens. Nexus provides map geometry and pit assignments. TBA and
FIRST provide official event rosters, schedules, and results where available.

Rank Teams should use readable stacked robot cards on phones. Keep each Pick
button and compact EPA/xP/RP summary visible; show robot photos and detailed
stats and the shared Elo table on demand. Desktop retains the side-by-side
comparison and expanded rankings.
