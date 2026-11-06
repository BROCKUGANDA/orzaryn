# ORZARYN demo — TTS narration segments (edge-tts, neural voice, normal pace).
import asyncio
import json
import edge_tts

VOICE = "en-US-AndrewMultilingualNeural"  # warm, natural male
RATE = "-4%"  # hair under normal → comfortable narration

SEGMENTS = [
    ("s01_landing",   "ORZARYN gives AI agents the one thing raw autonomy never had: authority with limits, and settlements you can prove."),
    ("s02_auth",      "Every session starts with signed, expiring credentials. No shared keys. No shadow admin."),
    ("s03_dashboard", "The console shows live system health — real RPC, real worker, real database. Every number on this screen comes from the running system."),
    ("s04_mandates",  "Mandates are the control surface: per-purchase, daily, weekly, and aggregate limits, enforced before any purchase executes."),
    ("s05_agents",    "Each agent gets scoped API credentials, bound to its mandate. Agents can act — only inside the fence."),
    ("s06_workorders","A purchase becomes a work order with a full state machine: approval, funding, delivery, evidence, and review. Nothing skips a step."),
    ("s07_settle",    "Settlement produces receipts with on-chain references. Escrow releases only after evidence review."),
    ("s08_treasury",  "The treasury tracks every escrowed, released, and refunded dollar — double-entry, idempotent, reconciled."),
    ("s09_reports",   "And reports keep the whole organization accountable, with analytics over real activity."),
    ("s10_close",     "ORZARYN. Authority, bounded. Settlement, proven."),
]

async def main():
    out = {}
    for name, text in SEGMENTS:
        c = edge_tts.Communicate(text, VOICE, rate=RATE)
        mp3 = f"scripts/video/narr_{name}.mp3"
        await c.save(mp3)
        out[name] = text
        print(name, "saved")
    json.dump(out, open("scripts/video/narration.json", "w"), indent=1)

asyncio.run(main())
