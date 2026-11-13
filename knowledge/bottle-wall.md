# The bottle wall: "Our building is a video game"

The lab's first big season: a screen of 512 plastic bottles on a balcony that the neighbourhood plays Snake on.

Bottles collected so far: 312 / 512.

## The idea in one line

> We turned 512 empty plastic bottles into a giant screen on our building, and the whole neighbourhood plays Snake on it from their phones.

## Why people will care

- **Instantly visual**: a building that becomes a video game reads in one second on any feed.
- **Everyone can join**: scan a QR code, play on the building. The audience becomes the content.
- **Scrap to magic**: plastic bottles everyone throws away become a light show. Recycling without preaching.
- **Neighbourhood vibe**: kids, grandparents and café regulars playing together. Very Tunisian, very warm.
- **“First playable building in Tunisia”**: (verify: and phrase carefully)

## Tone and characters

- **Pure fun**: the channel's “fun project”. Lots of laughs, fails and night shots.
- **The crew**: the electronics one, the bottle-collecting team, the coder, and the presenter who negotiates with the neighbours.
- **The neighbours**: sceptical at first (“what are you doing with all those bottles?”), then hooked. A great character arc.
- **The kids of the street**: the best players and the best reactions — on camera only with their parents' consent.

## Recurring elements

- **Bottle counter**: “312 / 512 bottles collected”. The live one is at the top of this plan.
- **High-score board**: on the wall itself: neighbourhood champions with nicknames.
- **Game night**: a fixed weekly evening when the street plays together.
- **“Cost so far”**: in TND on screen in every episode.

## Season arc

_“Our building is a video game”_

Big question: Can we turn trash and a balcony into something that brings a whole neighbourhood outside?

### Ep 0: Teaser (30 s)

What happens: Night. A dark building. One bottle lights up… then 512. Snake moves across the facade. Someone in the street holds their phone and laughs.

Payoff: The hook for the whole season

### Ep 1: We need 512 bottles

What happens: “We're going to build a giant screen. Step one: 512 empty bottles.” Precedents: Blinkenlights (Berlin, 2001), Tetris on MIT's Green Building, the Cira Centre Tetris in Philadelphia (a Guinness record), a Kiel student project (verify). A bottle-hunt race through cafés, neighbours and friends. Mini prototype: 8 × 8 bottles indoors, first Snake on 64 pixels.

Payoff: The mini-wall works. Cliffhanger: “Now we need permission to put 512 of these on the building.”

### Ep 2: Convincing the building

What happens: The syndic, the neighbours, maybe the municipality — filmed with humour. Promises: brightness cap, off at 23:00, no strobing, moderated messages.

Payoff: The neighbours say yes, and some help build

### Ep 3: The build

What happens: Frame on the balcony, 512 bottles, 512 LEDs, power by sections, waterproofing. First full night test → half the wall goes dark (power problem) → fix it.

Payoff: The full wall lights up for the first time. Wide shot from the street

### Ep 4: Launch night: the street plays

What happens: QR poster at the bottom of the building. The first neighbour plays Snake on the facade. Tournament: kids vs. grandparents vs. café regulars. Crowd mode: everyone votes the next move.

Payoff: The reactions, and “___ people played in one night”

### Ep 5: Making it smart

What happens: Collaborative pixel art for the street, polls, a live derby score. AI side-quest: a filter that understands Tunisian Derja and Arabizi to block insults in messages.

Payoff: The neighbourhood's first collective pixel artwork

### Ep 6: Finale: Ramadan nights (or Derby night)

What happens: An iftar countdown on the building every evening; after iftar, the street gathers to play. Season stats: players, games, high score, bottles saved from the trash, total cost.

Payoff: “From 512 bottles to the heart of the neighbourhood”

## Season 2 seeds

- **Daytime upgrade**: P10 LED panels rescued from dead shop signs.
- **Whole building**: every window becomes one pixel, Blinkenlights-style, with all the neighbours.
- **Festival edition**: take the wall to a cultural or light-art event in the Medina (verify: which festival and dates).
- **Links with other projects**: run the wall on solar power, or show another experiment's live counter.

## Formats per episode

| Format | Use |
|---|---|
| Long video (8–12 min) | The episodes above |
| Shorts / reels | Teaser lighting up; “scan and play on a building” POV; kids vs. grandma; the fail when half the wall dies |
| Live | Game night, live from the street |
| Carousel | Cost breakdown; scrap → screen before/after |

## Headline moments we want

- 512 bottles collected in ___ days
- The first full light-up, filmed from the street
- A grandmother beating a kid at Snake on a building
- ___ players in one night
- Total cost in TND
- The neighbourhood's pixel artwork

## Timing

- **October – December 2026**: bottle collection, prototype, permissions, build.
- **Winter evenings**: launch (it gets dark early, so shows are longer).
- **Ramadan, around February – March 2027**: the finale (iftar countdown and night gatherings). (verify: exact dates nearer the time)

## How the wall works

_Technical plan_

How a move travels from a phone to the bottles: Phone (QR code → web page, D-pad or swipe) → (WebSockets) → Game server (Node.js, renders 32 × 16 frames, ~20 fps) → (DDP or E1.31) → ESP32 + WLED (receives live frames) → (WS2811 data) → 512 bottles (one LED pixel per bottle)

- **Grid**: 32 columns × 16 rows = 512 bottles, one LED pixel per bottle.
- **Pixels**: waterproof 12 mm “bullet” pixels (WS2811, IP68) push neatly into bottle necks. Consider 12 V versions to reduce voltage drop across a long wall.
- **Power**: at full white, 512 pixels can draw roughly 30 A at 5 V. Cap brightness (30–40%) and inject power at several points so the far end doesn't fade. Mains power supplies stay **indoors**; only low voltage goes outside, with fuses on each section.
- **Controller**: an ESP32 running WLED (open-source LED firmware) that receives live frames over the network (DDP or E1.31).
- **Game server**: a small Node.js server holds the game state, renders each 32 × 16 frame (~20 fps) and streams it to the ESP32.
- **Phone controller**: scanning the QR code opens a web page with a D-pad/swipe controller connected to the server over WebSockets. No app download.
- **Queue**: one player at a time, with a visible “you're next” screen and a time limit per game, so launch night doesn't become a crowd around one phone.
- **Crowd mode**: everyone connected votes the next move every half second; the majority wins.
- **Messages and pixel art**: everything goes through moderation (automatic AI filter tuned for Derja/Arabizi + a human check) before it appears on the wall.
- **Mounting**: a wall of 512 bottles catches wind like a sail — the frame must be fixed very solidly. Clear plastic yellows in strong sun; fine for one season.

## Rough cost estimate

In TND. Estimates to check against local prices, not quotes.

| Item | Low (TND) | High (TND) |
|---|---|---|
| 512 waterproof bullet pixels (WS2811, IP68) | 400 | 900 |
| Power supplies (2 × high-current, indoor) | 150 | 300 |
| Power injection cable, fuses, connectors | 100 | 250 |
| Frame (treated wood or aluminium + mesh) | 200 | 600 |
| ESP32, level shifter, enclosure | 50 | 100 |
| Waterproof junction boxes, cable glands | 50 | 150 |
| Zip ties, silicone, fixings | 50 | 100 |
| QR poster and signage | 20 | 50 |
| Bottles | 0 | 0 |
| **Total** | ≈ 1,020 | ≈ 2,450 |

This is bigger than the lab's starter budget, so it fits best as a month 2–4 build, not the very first episode.

## Rules for the series

- [ ] Permission from the syndic and neighbours before mounting
- [ ] Informal check with the municipality (baladiya)
- [ ] Brightness cap set in firmware
- [ ] Automatic switch-off at 23:00
- [ ] No strobing or rapid flashing (road safety, neighbours, photosensitivity)
- [ ] Every message and pixel artwork moderated; nothing political, religious or insulting
- [ ] Low voltage outside only; fuses per section; mains supplies indoors
- [ ] Frame fixing tested for wind
- [ ] Kids on camera only with parents' consent
- [ ] On camera, cite only verified precedents; “first in Tunisia” only once verified

## Open questions

- Which balcony/facade, and who owns the decision?
- Where does power come from, and who pays the electricity?
- Who keeps the server running on game nights?
- Do we want the wall to announce the café opening at the end of the season?
