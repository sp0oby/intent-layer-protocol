# Security policy

Intent Layer Protocol is **early-stage software**. Do **not** use it with real funds without independent review and appropriate risk controls.

## Reporting a vulnerability

Please report security issues **privately** so we can investigate and ship fixes before public discussion.

1. Prefer opening a [**GitHub Security Advisory**](https://github.com/sp0oby/intent-layer-protocol/security/advisories/new) for this repository (available when GitHub security advisories are enabled on the repo).
2. If that is not available, open a **private** issue or contact the maintainers through a channel they have published on their GitHub profile — **do not** file public issues for undisclosed vulnerabilities.

Include, when possible:

- A short description of the issue and its impact  
- Affected components (contracts, backend API, frontend, infra)  
- Steps to reproduce or a proof of concept  
- Suggested fix (optional)

We aim to acknowledge valid reports within a few business days. This is a best-effort community project; timelines depend on maintainer availability.

## Scope

Generally **in scope**: code in this repository as documented (smart contracts, backend, frontend, CI, and local dev tooling that ships here).

Generally triage **out of scope** or **third-party**: issues that require no change in this repo (e.g. upstream dependency defects unless the fix is in our integration layer), purely social engineering, or denial-of-service against free-tier RPCs without a concrete product impact.

## Safe harbour

We support good-faith security research that follows this policy. Do not access data that is not yours, disrupt production services you do not own, or violate law.

## More context

- Product risk framing: [Risk analysis](docs/RISK_ANALYSIS.md)  
- Day-to-day expectations: [CONTRIBUTING.md](CONTRIBUTING.md)
