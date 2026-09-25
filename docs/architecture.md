# Architecture

```
Staff browser                      WhatsApp bot (separate system, not built here)
     │                                        │
     │                                        │  HTTPS + API key
     │                                        ▼
Web app (Next.js, TypeScript, App Router) ◄── /api/v1  (read packages, hold seats,
     │                                                   report paid, cancel a hold)
     ├──► Claude API   (Phase 2 only — reads pasted airline text into a draft form)
     │
     ├──► PostgreSQL (Supabase)   — all real data
     │
     ├──► Supabase Storage   — private files: payment proofs, original airline messages
     │
     └──► Daily scheduled job (Vercel Cron)
                │
                └──► Resend (email) ──► staff (deadline alerts, agent dues)
                                        + airlines (deposit confirmations)
                                        + agents (dues notices — always a human click)
```

## The two sides

**Buying side** (phases 1–5, complete): seats bought from airlines against EMD
deposits, until tickets are issued.

**Selling side** (phases 6–8): who those seats are sold to. Every PNR is bought on
company investment and starts **unassigned**; staff then hand seats to **agents**,
or assign them to the **WhatsApp bot** to sell to customers. Both are views over
the same PNR record — there is no separate "agent PNR" or "B2C PNR".

The bot is a **separate system with its own backend**, holding the customer
conversation, customer data and payment accounting. It talks to this system only
through `/api/v1`, and only about seats: what is for sale, hold some, they are
paid for, cancel that hold. No customer personal data is sent here.

## Stack and why

| Piece | Choice | Why |
|---|---|---|
| App framework | Next.js + TypeScript | One codebase, huge ecosystem, easy for an AI agent to generate correct, idiomatic code |
| Database | PostgreSQL via Supabase | Handles relational data (parent/child PNRs, EMD rounds) properly; managed backups included |
| Table/grid UI | TanStack Table | Gives the spreadsheet feel staff already know |
| Auth | Supabase Auth | Do not hand-roll authentication — this is the single highest-risk place for custom code to introduce a security hole |
| Scheduled job | Vercel Cron | One job, runs once a day, checks upcoming deadlines |
| Email | Resend | Reliable delivery, keeps a sent-log |
| File storage | Supabase Storage | Private by default, signed URLs |
| AI parsing | Claude API | Only used to convert pasted airline text into draft form fields (Phase 2). A human always confirms before saving. |
| Bot integration | Plain REST under `/api/v1`, API-key auth | One consumer, a handful of endpoints. No GraphQL, no gateway, no queue, no webhooks back — the bot polls what it needs (rule 7) |
| Hosting | Vercel, functions pinned to **Singapore (`sin1`)** | Zero server maintenance for a small internal team. The region is set in `vercel.json` to sit beside the database (Supabase `ap-southeast-1`); Vercel's default for new projects is Washington D.C., which put every query across the Pacific (2026-09-24) |
| Database access | Prisma 6 over the **node-postgres driver adapter** (`@prisma/adapter-pg`) through Supabase's transaction pooler | One network round trip per query. The built-in engine in `pgbouncer=true` mode measured about five (2026-09-24). `relationJoins` makes an `include` one query instead of one per relation |
| Caching | **None beyond Next's defaults — no Redis** | Measured: the slowness was round trips, not work the database repeated. Redis would add a network hop and a service that must be up, and cache money figures that must be exact. Revisit only for a bottleneck measured after the 2026-09-24 fixes |

## Explicitly out of scope (do not build unless the project owner asks)

- Direct GDS/Amadeus integration
- Mobile app
- Microservices / container orchestration
- A generic report builder
- Automatic reading of a mailbox (staff paste messages manually — this avoids a whole category of failure)
- Any automatic action on financial data without a human confirming first (e.g. auto-sending emails, auto-cancelling PNRs). **The bot is not an exception**: it reports what its own customers paid it, which is a fact it owns. Nothing about EMDs, agent recoveries or airline money is ever moved without a staff click
- Logins for agents or customers. Agents are records, not users (owner ruling, 2026-09-16); customers exist only in the bot's own system
- Customer personal data. The bot sends seat counts, never names, passports or contact details
- Ticket-loss and penalty-EMD calculations (the >25% unsold rule). Still deferred — the selling side coming into scope does **not** bring these with it

> **Superseded:** this list previously read "the selling side of the business
> (agent sales, ticket cancellations, penalty EMD) — buying side only, for now".
> The project owner brought the selling side into scope on 2026-09-16/17; see
> `decisions.md` for the 24 rulings that define it. Penalty EMD and ticket loss
> remain out, as above.

If a phase document seems to imply one of the above, stop and ask before building it.
