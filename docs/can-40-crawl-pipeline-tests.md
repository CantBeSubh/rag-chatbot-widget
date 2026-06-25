# CAN-40: Crawl Pipeline Testing — Commands

8 manual tests to validate the URL crawl pipeline before M3.

## Setup

```bash
# Set once — fill in your actual values
export API_KEY="your_api_key_here"
export BASE="http://localhost:8000"
```

Make sure the server and Celery worker are both running:

```bash
# Terminal 1
cd backend && make dev

# Terminal 2
cd backend && uv run celery -A app.worker.celery_app worker --loglevel=info
```

---

## Test 1 — Static docs site

```bash
# Submit crawl
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://fastapi.tiangolo.com", "max_pages": 10}' | jq .

# Save the source_id from above, then poll
SOURCE_ID="<from above>"
watch -n 5 'curl -s '$BASE'/sources/'$SOURCE_ID' -H "Authorization: Bearer '$API_KEY'" | jq "{status,chunk_count,error_message}"'

# Once done, ask a question
curl -s -X POST $BASE/chat \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is FastAPI?"}' | jq "{answer,sources}"
```

**Pass:** `status=done`, `chunk_count > 0`, answer is grounded.

---

## Test 2 — JS-rendered site

```bash
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://tailwindcss.com/docs", "max_pages": 5}' | jq .

SOURCE_ID="<from above>"
curl -s $BASE/sources/$SOURCE_ID \
  -H "Authorization: Bearer $API_KEY" | jq "{status,chunk_count}"
```

**Pass:** `chunk_count > 0`, not suspiciously small. If `chunk_count` is very low (< 5), check crawl4ai `wait_until` config.

---

## Test 3 — Re-crawl deduplication

```bash
# First crawl
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://fastapi.tiangolo.com", "max_pages": 5}' | jq .

# Wait for done, note chunk_count (N)

# Second crawl — same URL
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://fastapi.tiangolo.com", "max_pages": 5}' | jq .

# Wait for done — second source's chunk_count should be 0
SOURCE_ID_2="<second source_id>"
curl -s $BASE/sources/$SOURCE_ID_2 \
  -H "Authorization: Bearer $API_KEY" | jq "{status,chunk_count}"
```

**Pass:** 2nd crawl `chunk_count=0`.

---

## Test 4 — Delete + re-crawl

```bash
# Use a SOURCE_ID that is status=done
SOURCE_ID="<a done source>"

# Delete it
curl -s -X DELETE $BASE/sources/$SOURCE_ID \
  -H "Authorization: Bearer $API_KEY" | jq .

# Re-crawl same URL
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://fastapi.tiangolo.com", "max_pages": 5}' | jq .

# Poll — should get chunk_count=N again (not 0)
SOURCE_ID_NEW="<from above>"
watch -n 5 'curl -s '$BASE'/sources/'$SOURCE_ID_NEW' -H "Authorization: Bearer '$API_KEY'" | jq "{status,chunk_count}"'
```

**Pass:** re-crawl gets `chunk_count > 0`.

---

## Test 5 — Unreachable URL

```bash
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://this-definitely-does-not-exist-xyz123.com", "max_pages": 5}' | jq .

SOURCE_ID="<from above>"
watch -n 5 'curl -s '$BASE'/sources/'$SOURCE_ID' -H "Authorization: Bearer '$API_KEY'" | jq "{status,error_message}"'
```

**Pass:** `status=error` with a readable `error_message`. Fail if stuck in `crawling` forever.

---

## Test 6 — Cap enforcement (max_pages)

```bash
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.python.org", "max_pages": 5}' | jq .

SOURCE_ID="<from above>"
watch -n 5 'curl -s '$BASE'/sources/'$SOURCE_ID' -H "Authorization: Bearer '$API_KEY'" | jq "{status,chunk_count}"'
```

**Pass:** Task completes. Check Celery logs that crawler fetched ≤ 5 pages.

---

## Test 7 — Tenant isolation

```bash
export API_KEY_A="tenant_a_key"
export API_KEY_B="tenant_b_key"

# Crawl something for Tenant A
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY_A" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://fastapi.tiangolo.com", "max_pages": 3}' | jq .

# Wait for done, then query using Tenant B's key
curl -s -X POST $BASE/chat \
  -H "Authorization: Bearer $API_KEY_B" \
  -H "Content-Type: application/json" \
  -d '{"question": "What is FastAPI?"}' | jq "{answer,sources}"
```

**Pass:** Tenant B gets no relevant results — answer should disclaim knowledge, no sources cited.

If you need a second tenant, create one in Supabase SQL editor:

```sql
INSERT INTO testing.tenants (name, api_key) VALUES ('Tenant B', 'test-key-tenant-b');
```

---

## Test 8 — Worker crash recovery

```bash
# Start a crawl large enough to take a few seconds
curl -s -X POST $BASE/ingest/url \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://docs.python.org", "max_pages": 20}' | jq .

# While it's running, kill the worker
pkill -f "celery.*worker"

# Restart the worker
cd backend && uv run celery -A app.worker.celery_app worker --loglevel=info

SOURCE_ID="<from above>"
watch -n 10 'curl -s '$BASE'/sources/'$SOURCE_ID' -H "Authorization: Bearer '$API_KEY'" | jq "{status,chunk_count,error_message}"'
```

**Pass:** Source reaches `done` or `error` within a few minutes of worker restart. Fail if stuck in `crawling`.
