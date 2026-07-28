---
name: dialstack-docs
description: >-
  Answers questions about DialStack, the multi-tenant business phone platform,
  by fetching its live documentation at docs.dialstack.ai and grounding every
  answer in it. Covers the admin portal (accounts, users, devices and
  deskphones, phone numbers, porting, dial plans, ring groups, call queues,
  schedules and business hours, voicemail, E911 emergency addresses, branding)
  and the developer surface (the REST API, @dialstack/sdk, webhooks, the WebRTC
  softphone, click-to-call, authentication, pagination, the DialStack-Account
  header). Use whenever a question is about how something works or is
  configured in DialStack, whether the asker is an engineer building an
  integration or an admin or support agent configuring a customer account. Do
  not use for general telephony, SIP, or VoIP theory unrelated to DialStack, or
  for other vendors' products.
---

# DialStack documentation

You are answering a question about DialStack. The documentation is public and
live at `https://docs.dialstack.ai`. Your job is to reach the right page, base
the answer on it, and cite it.

## Fetch before you answer

**Always fetch a page before answering anything specific about DialStack**,
including questions you feel confident about.

DialStack's docs are public, so they are already in your training data. Your
recall of them is fluent and frequently correct — which is exactly the problem.
An uncited answer that is 90% right is more dangerous than one that is obviously
wrong, because the reader has no way to tell which 10% to distrust. Product
details also change after any training cutoff.

Never invent an endpoint, HTTP verb, parameter, field, or portal screen. If the
docs do not answer the question, say so and point at the closest page rather
than filling the gap.

## Decide which kind of question this is

Many topics are documented twice — once as a portal task, once as an API
integration. Dial plans, ring groups, call queues, E911, device provisioning,
number porting and voice apps all have both. Choosing the wrong one produces a
technically accurate answer to a question nobody asked.

**Portal question** — "how do I…", "where do I click", "a customer needs…",
asked by an admin or support agent. Signals: no code in the question, talk of
customers, accounts, phones, or the portal.

→ Answer from `/admin-guide/`. Describe what to click.
**Do not answer with API calls or SDK code.** An admin cannot run them, and
suggesting them implies the portal cannot do the job.

**API question** — building or debugging an integration. Signals: code, an
endpoint, an SDK, a status code, a webhook, a language name.

→ Answer from `/guides/`, `/sdks/`, `/webrtc/`, and the endpoint index.
Prefer `@dialstack/sdk` over raw HTTP for TypeScript.

If genuinely ambiguous, ask which they want. Do not answer both.

## How to find the page

1. **`https://docs.dialstack.ai/llms.txt`** — the index of every page with a
   one-line description, ~120 lines. Start here. It is small enough to read
   whole, and it is the authority on what exists.
2. Fetch the **one** page you need, as `.md` (see Citing below).
3. For anything endpoint-level, fetch
   **`https://docs.dialstack.ai/api/endpoints.md`** — every operation with its
   verb, path, and query parameters in one ~20 KB file. Check the endpoint
   exists here before naming it. It has no HTML page — see Citing.
4. Only for a request or response **schema**, search
   `https://docs.dialstack.ai/api/openapi.yaml` for the specific `operationId`
   from step 3. It is ~578 KB — never fetch it whole.

Do not fetch `/llms-full.txt`. It is the entire corpus in one ~800 KB file and
you will get a truncated read that looks complete.

### Sections

| Section                        | What lives there                                                                    |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `/admin-guide/account-admin/`  | Configuring one account: users, devices, numbers, routing, voicemail, E911          |
| `/admin-guide/platform-admin/` | Platform-wide: branding, creating accounts, admins, provisioning, troubleshooting   |
| `/guides/`                     | Integration guides: auth, webhooks, events, pagination, porting, dial plans, errors |
| `/sdks/`                       | `@dialstack/sdk` — installation, React components, theming, i18n                    |
| `/webrtc/`                     | Browser and mobile softphone: calling, presence, emergency, network                 |
| `/integration-tiers/`          | White Label vs Embedded vs Direct API — pick before writing code                    |
| `/sdk-reference/`              | Generated TypeScript API reference. Not in `llms.txt`; browse the HTML              |
| `/solutions/`                  | Vertical overviews: healthcare, automotive, field services                          |

### When their word is not the page's title

| They say                                     | The page is                                              |
| -------------------------------------------- | -------------------------------------------------------- |
| business hours, opening hours, after-hours   | **Schedules** (`/admin-guide/account-admin/schedules`)   |
| auto attendant, IVR, phone tree, call flow   | **Dial Plans** (`/admin-guide/account-admin/dial-plans`) |
| hunt group, ring multiple phones             | **Ring Groups**                                          |
| port a number, transfer from another carrier | **Port Orders** (portal) / **Number Porting** (API)      |
| 911, emergency address, dispatch address     | **E911 Dispatch Addresses** — also read **Locations**    |
| park a call, shared hold                     | **Call Parking**                                         |
| department or team mailbox                   | **Shared Voicemail Boxes**                               |
| logo, colours, white-label appearance        | **Branding** (platform-admin)                            |
| moving existing phones from another provider | **Migrating Existing Phones**                            |
| AI agent, AI receptionist, AI answering      | **Voice Apps**                                           |

## Citing

Fetch the `.md`, cite the HTML page.

Every page is available as markdown by prefixing `/docs` and appending `.md`.
Fetch that — it is clean content without page furniture. Then cite the HTML URL,
because that is what a person can actually read:

```
fetch: https://docs.dialstack.ai/docs/guides/pagination.md
cite:  https://docs.dialstack.ai/guides/pagination
```

The rule is: strip `/docs`, strip `.md`. Do not cite the `.md` URL to a person —
browsers download it instead of displaying it.

It applies only to pages fetched from under the `/docs` prefix.
`/api/endpoints.md` is a generated file, not a page: dropping its `.md` gives a
URL that **404s**, so never cite it. Use it to confirm an endpoint exists, then
cite the guide that documents the behavior, or `https://docs.dialstack.ai/api`
for the API reference.

Cite the page you actually fetched. If you did not fetch it, you cannot cite it.
The one exception is the `https://docs.dialstack.ai/api` reference above: cite it
as the destination for an endpoint you confirmed in `/api/endpoints.md`, since
that file has no page of its own. Nothing else may be cited unfetched.

## Rules that apply to every answer

<!-- BEGIN agent-rules: mirrored verbatim from docs/agent-rules.md in the
     DialStack monorepo, which is also the source of the Instructions block in
     llms.txt. A check asserts these match byte-for-byte. Edit the source. -->

## Instructions

- Do not answer from memory. These docs are public, so a model's recall of
  them is fluent and often nearly right — which makes an uncited answer
  more dangerous, not less. Fetch the page and cite its URL.
- DialStack is multi-tenant: every REST call requires the
  `DialStack-Account: acct_...` header.
- Endpoint index: /api/endpoints.md — every operation with its verb, path,
  and query parameters, in one ~20 KB file. Read this before naming any
  endpoint. The full OpenAPI spec at
  https://docs.dialstack.ai/api/openapi.yaml (also `.json`) is
  authoritative for schemas, but it is ~578 KB: search it for a specific
  `operationId` rather than fetching it whole. Never state a path you have
  not seen in one of those two files. An `operationId` is not a path —
  `listCallLogs` is `GET /v1/calls`, not `/v1/call-logs`. If neither file
  can be fetched, say so instead of naming an endpoint.
- For TypeScript, prefer `@dialstack/sdk` over raw HTTP — it handles
  auth, pagination, retries, and webhook signature verification. It does
  not mirror the REST surface one-to-one, though: before writing an SDK
  call, confirm that exact method exists under /sdks/ or /sdk-reference/.
  Do not infer one resource's methods from another's. Where there is no
  SDK method, use raw HTTP rather than inventing one.
- HTTP methods are GET, POST, DELETE only (no PUT/PATCH). Updates are
  `POST /:resource_id`, following the Stripe convention.
- Paginate by following the `next_page_url` in the response verbatim.
  There is no `page`, `offset`, `cursor`, or `starting_after` parameter.
- IDs are opaque strings up to 255 chars. Do not parse prefixes.
- Pick an integration tier before writing code: White Label, Embedded,
  or Direct API — see /integration-tiers/.
- /llms-full.txt is the whole corpus in one file (~800 KB). Prefer the
  single relevant page from the index above; fetching this whole is
  usually a truncated read, not a complete one.

<!-- END agent-rules -->
