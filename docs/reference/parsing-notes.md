# Parsing Notes — Phase 2 Step 3

**Providers:** Groq → Cerebras → OpenRouter, tried in that order (see `src/lib/ai/parse-booking.ts`).
Local Ollama was removed on 2026-09-07 — it could only ever work on a developer's own
machine, and on the deployed app it was a guaranteed connection failure before every
real provider was reached.

## Summary

The AI Intake parser (`/api/ai/parse-pnr`) handles structured and semi-structured airline messages effectively, but results vary based on the clarity of the source text and the capacity of the local LLM.

## Airline Format Analysis

### Formats that parse well
- **SV (Saudia)**: Structured confirmation formats (like the multi-PNR screenshot block) with clear field labels extract extremely reliably.
- **PK (PIA)**: Email-style confirmations with labeled fields (e.g., "Group Size: 35", "Base Fare: PKR 62,000") parse well.
- **FZ (flydubai)**: Detailed booking emails with explicit EMD breakdowns extract most fields accurately.

### Formats that need manual entry as fallback
- **Short/abbreviated messages** (e.g., GDS-style codes like "DEP 10DEC26") — date parsing is highly model-dependent.
- **WhatsApp-style informal messages** (e.g., Serene Air quick texts) — field boundaries are ambiguous; sector/route may be incomplete.
- **Image-only inputs** — requires a vision-capable local model. `gemma3:4b` is text-only, so images must be processed by larger cloud models (like OpenRouter) or handled via Excel upload if tabular.

## Consistently weak fields

| Field | Issue |
|-------|-------|
| `investorCompany` | Rarely present in airline confirmations (it's the agent's internal data, not the airline's). Almost always needs manual entry. |
| `licenseName` / `branchName` | Almost never in airline messages — always needs manual entry. |
| `gdsPnr` | Only present when the booking goes through a GDS; absent in direct airline messages. |
| `dealPct` | Internal business metric — never in airline output. |
| `psf` | Rarely broken out separately in informal confirmations. |

## Recommendations

1. **SV Umrah bulk lists** (like the 15-PNR screenshot): Best handled via Excel upload or structured text paste. The deterministic Excel parser (`parse-excel.ts`) is 100% reliable for tabular data, whereas an LLM can get overwhelmed by huge blocks of text.
2. **Single PNR confirmations**: LLM parsing works well for extracting PNR, dates, seats, sector, and fare. Staff should expect to manually fill investor, license, branch, and deal%.
3. **Model choice**: the fallback chain's model ids have never been verified against the providers' current catalogues — worth checking, since an invalid id fails silently and simply falls through to the next candidate.
