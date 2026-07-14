# EO Command Center — Live Review Checklist

**For the project owner's live validation (Step 1/2/7).** Evaluate the dashboard as an *operations tool*,
not a UI demo. The success criterion for a command center is **not** "does it render" — it is:

> **Can an EO recognize the highest-priority issue and take the correct action within a few seconds?**

Run `/admin/command` as a `TEMPLE_EO` against real (or realistically seeded) data.

---

## A. First-glance test (the 5-second rule)
- [ ] Can the EO identify the **highest-priority issue within 5 seconds**?
- [ ] Does the eye land on the **Attention Queue** first (not revenue)?
- [ ] Is anything **visually competing** for attention that shouldn't be?

## B. Attention Queue (the heart)
- [ ] Are the items **actionable** — does each lead to the right screen?
- [ ] Is severity ordering correct and legible (CRITICAL → LOW)?
- [ ] Does it **drive behavior**, or is it just a list?
- [ ] On a quiet day, does the empty state ("Nothing needs attention") reassure rather than look broken?

## C. KPIs & information density
- [ ] Are the KPIs **actually useful** to an EO, or vanity metrics?
- [ ] Any KPI that is **unnecessary** and should be removed?
- [ ] Is the density right for **8-hour daily use** (OX), not marketing (CX)?

## D. Operational scenarios — walk each one
For each, ask: *does the dashboard surface it, and can the EO act correctly?*
- [ ] **Morning opening** — what does the EO need to see first?
- [ ] **Festival day** — high volume; does Attention stay legible?
- [ ] **Priest absent** — is it surfaced? (needs the STAFF attention source wired)
- [ ] **Inventory shortage** — surfaced? (needs INVENTORY attention source)
- [ ] **Revenue anomaly** — surfaced and actionable? (wired: `AnomalyAlert`)
- [ ] **Queue congestion** — surfaced? (needs QUEUE attention source)

> Note: the slice currently wires REVENUE + APPROVAL attention sources. STAFF / INVENTORY / QUEUE
> normalizers are the next providers to add — this review will confirm they're the right priorities.

## E. Workflow correctness
- [ ] Does the layout **encourage the correct operational workflow** (attention → act → monitor)?
- [ ] Does the OX theme feel like a **command center**, clearly distinct from the devotee portal (CX)?
- [ ] Do the deep-links land on the **right** screens?

## F. Resilience (verify live)
- [ ] Kill one provider's source → does only that widget degrade (banner + "unavailable"), dashboard intact?
- [ ] Do polling intervals feel right (Attention 15s, Financial 60s)? Too chatty / too slow?

---

**Outcome gate:** if A–E pass, the platform layer is validated for rollout. Capture any failures as issues;
per the agreed plan, **freeze the platform layer** after this review unless a critical issue is found, and
shift to applying it across modules rather than refining the framework.
