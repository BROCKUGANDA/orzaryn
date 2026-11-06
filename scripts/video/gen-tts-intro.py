# ORZARYN intro — TTS segments (third-person, factual; the synthetic voice
# speaks ABOUT the builder, never AS them).
import asyncio
import edge_tts

VOICE = "en-US-AndrewMultilingualNeural"
RATE = "-4%"

SEGMENTS = [
    ("i1_intro",  "This is ORZARYN — and this is the person building it."),
    ("i2_problem","Companies are starting to let AI agents buy things — data, APIs, compute. But finance teams have no seat belt. You either block agents entirely, or you hand them a card and pray."),
    ("i3_build",  "ORZARYN is the middle ground. Agents get cryptographic spending mandates — hard limits, enforced before any purchase executes."),
    ("i4_lifecycle", "Every purchase becomes a work order: approved, funded into escrow, delivered, evidence reviewed. Only then does settlement move USDC on Solana — receipts, treasury, and an audit trail every entry can be traced through."),
    ("i5_who",    "All of it — the policy engine, the double-entry ledger, the state machines, the Solana escrow program — is built end to end by one engineer: Otema Okot Araa Andrew."),
    ("i6_convict","In a market racing to give agents more autonomy, the durable company is the one that makes autonomy safe to spend."),
    ("i7_close",  "ORZARYN. Authority, bounded. Settlement, proven."),
]

async def main():
    for name, text in SEGMENTS:
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(f"scripts/video/narr_{name}.mp3")
        print(name, "saved")

asyncio.run(main())
