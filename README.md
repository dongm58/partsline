# PartsLine

PartsLine is a browser-based voice agent prototype for auto parts counters. It
uses a LiveKit browser room and Python agent worker to answer grounded parts
lookup questions against a Moss-backed demo catalog, with strict vehicle
metadata filtering before any fitment, price, or stock answer.

## Setup

Create a local `.env` from `.env.example` before running anything that talks to
LiveKit, Moss, Dartmouth Chat, Deepgram, or Cartesia:

```bash
cp .env.example .env
```

Fill in the provider values in `.env`. Do not commit `.env`.

## Run

From the repo root, start the Python voice agent:

```bash
python -m agent.main dev
```

In a separate terminal, start the Next.js app:

```bash
npm run dev
```

Open the voice test page from the Next.js dev server and connect from the
browser.

## Moss Pre-Flight

Before a live test session, verify that the Moss credentials can load the demo
index:

```bash
python -m agent.check_moss
```

It prints `Moss OK` on success or the actual Moss error on failure.
