import httpx
import asyncio
import json

async def test_generate():
    print("Testing POST /generate (SSE)...")
    async with httpx.AsyncClient(timeout=120) as c:
        async with c.stream(
            "POST",
            "http://localhost:8000/generate",
            json={
                "job_title": "Full Stack Engineer",
                "company": "Stripe",
                "mode": "cover_letter",
                "mode_label": "Cover Letter",
                "jd": "",
                "extra": "Keep it under 100 words",
                "context": "Name: Alex Chen\nRole: Full Stack Engineer\nSkills: React, Python, Node.js\nTone: Direct"
            }
        ) as resp:
            print(f"Status: {resp.status_code}")
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:]
                try:
                    ev = json.loads(raw)
                    t = ev.get("type")
                    if t == "chunk":
                        print(ev["text"], end="", flush=True)
                    elif t == "done":
                        print(f"\n\n[DONE] id={ev['id']} words={ev['wordCount']}")
                    elif t == "saved":
                        print(f"[SAVED] id={ev['id']}")
                    elif t == "error":
                        print(f"[ERROR] {ev['message']}")
                except Exception as e:
                    pass

async def test_list():
    async with httpx.AsyncClient() as c:
        r = await c.get("http://localhost:8000/applications")
        apps = r.json()
        print(f"\nApplications in DB: {len(apps)}")
        for a in apps:
            print(f"  - {a['company']} / {a['jobTitle']} | status={a['status']} | words={a['wordCount']}")

async def main():
    await test_generate()
    await test_list()

asyncio.run(main())
