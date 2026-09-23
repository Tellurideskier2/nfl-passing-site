# NFL Passing Yards Edge Finder

A simple no-build betting model website for NFL quarterback passing-yard props.

## What it does

Enter:
- QB
- Team
- Opponent
- Passing yards line
- Over odds
- Under odds
- Last 5 average passing yards
- Last 10 average passing yards
- Season average passing yards
- Projected attempts
- QB yards per attempt
- Opponent pass yards allowed/game
- Spread
- Game total
- Weather/dome adjustment
- Manual adjustment

It outputs:
- Projected yards
- Over probability
- Under probability
- Over EV per $100
- Under EV per $100
- Edge
- Best bet
- Confidence

## Run locally

Open `index.html` directly in your browser.

Or run with Node:

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## Deploy to Render

Use:
- Build command: `npm install`
- Start command: `npm start`

## First version model

Projected yards blends:
- Last 5 average
- Last 10 average
- Season average
- Projected attempts × yards/attempt
- Opponent passing yards allowed
- Game total
- Spread
- Weather
- Manual adjustment

This is meant to rank props and find possible +EV spots, not guarantee wins.
