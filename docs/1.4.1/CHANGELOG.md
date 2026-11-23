# 1.4.1 — Stack add / swap fix

Correct LoRA stack behaviour when adding or replacing a file (node + Edit preset).

## Fixes

- **⇄ Replace** — stays in the same slot (strengths / enabled kept); other copies of that path are removed
- **Add new** — appends at the end
- **Add duplicate** — no second row: enables if it was off, then moves that slot to the bottom

## Soft deps (unchanged)

- Civitai Toolkit — names, covers, base model, `?`
- ComfyUI-Custom-Scripts — `i` (View Lora info)
