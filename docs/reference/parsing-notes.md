# Parsing Notes — Phase 2 Step 3

**Providers:** these findings were recorded with earlier models. The current
providers, models and retry rules are in `docs/operations.md`, "The AI intake",
and `src/lib/ai/providers.ts` — the authority for which models run.

## Summary

The AI Intake parser (`/api/ai/parse-pnr`) handles structured and semi-structured airline messages effectively, but results vary based on the clarity of the source text.

## Airline Format Analysis

### Formats that parse well
- **SV (Saudia)**: Structured confirmation formats (like the multi-PNR screenshot block) with clear field labels extract extremely reliably.
- **PK (PIA)**: Email-style confirmations with labeled fields (e.g., "Group Size: 35", "Base Fare: PKR 62,000") parse well.
- **FZ (flydubai)**: Detailed booking emails with explicit EMD breakdowns extract most fields accurately.

### Formats that need manual entry as fallback
- **Short/abbreviated messages** (e.g., GDS-style codes like "DEP 10DEC26") — date parsing is highly model-dependent.
- **WhatsApp-style informal messages** (e.g., Serene Air quick texts) — field boundaries are ambiguous; sector/route may be incomplete.
- **Image-only inputs** — no longer a separate weak spot. Gemini is multimodal, so a screenshot goes to the same model as pasted text; earlier notes here described a text-only local model that could not read images at all.

## Consistently weak fields

| Field | Issue |
|-------|-------|
| `investorCompany` | Rarely present in airline confirmations (it's the agent's internal data, not the airline's). Almost always needs manual entry. |
| `licenseName` / `branchName` | Almost never in airline messages — always needs manual entry. |
| `gdsPnr` | Only present when the booking goes through a GDS; absent in direct airline messages. |
| `psf` | Rarely broken out separately in informal confirmations. |

## Recommendations

1. **SV Umrah bulk lists** (like the 15-PNR screenshot): Best handled via Excel upload or structured text paste. A spreadsheet's values are copied by code (`excel-mapping.ts`) — the AI only says which column is which — whereas an LLM reading a huge block of text can get overwhelmed.
2. **Single PNR confirmations**: LLM parsing works well for extracting PNR, dates, seats, sector, and fare. Staff should expect to manually fill investor, license and branch.
3. **Model choice**: check the configured models with `npm run ai:check` when parsing starts failing — a retired model answers 404 rather than failing silently.
