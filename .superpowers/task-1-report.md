## Status
DONE

## Changes Made
1. Added `from pydantic import BaseModel` import to `backend/app/routers/config.py` (line 2)
2. Added `config` to the router imports in `backend/app/main.py` (line 9)
3. Registered the config router with `app.include_router(config.router)` in `backend/app/main.py` (line 24)

## Test Results
```
$ cd backend && uv run python -c "import app.main"
Warning: You are sending unauthenticated requests to the HF Hub. Please set a HF_TOKEN to enable higher rate limits and faster downloads.
Loading weights:   0%|          | 0/199 [00:00<?, ?it/s]Loading weights: 100%|██████████| 199/199 [00:00<00:00, 8189.67it/s]
```

Result: ✅ Backend imports successfully with no errors

## Commits
- `26bb606` - Fix backend config router: add missing imports and register router
