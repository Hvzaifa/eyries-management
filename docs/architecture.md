# Architecture

```
Staff browser
     │
Web app (Next.js, TypeScript, App Router)
     │
     ├──► Claude API   (Phase 2 only — reads pasted airline text into a draft form)
     │
     ├──► PostgreSQL (Supabase)   — all real data
     │
     ├──► Supabase Storage   — private files: payment proofs, original airline messages
     │
     └──► Daily scheduled job (Vercel Cron)
                │
                └──► Resend (email) ──► staff (deadline alerts) + airlines (deposit confirmations)
```

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
| Hosting | Vercel | Zero server maintenance for a small internal team |

## Explicitly out of scope (do not build unless the project owner asks)

- Direct GDS/Amadeus integration
- Mobile app
- Microservices / container orchestration
- A generic report builder
- Automatic reading of a mailbox (staff paste messages manually — this avoids a whole category of failure)
- Any automatic action on financial data without a human confirming first (e.g. auto-sending emails, auto-cancelling PNRs)
- The selling side of the business (agent sales, ticket cancellations, penalty EMD) — buying side only, for now

If a phase document seems to imply one of the above, stop and ask before building it.
