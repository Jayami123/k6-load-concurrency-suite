# I find the point where your product breaks when everyone uses it at once

Most products work fine when one person tries them. They fail when many people do the same thing at the same moment.
Two buyers take the last item. Two people book the same time slot. Two signers finish the same document at once.
These failures cost money and trust, and a normal test never shows them.

I'm a QA engineer who specializes in exactly this: load and concurrency testing. I put a product under realistic
pressure, find where it breaks, and give your team a plain-English list of what to fix.

**Open to full-time QA, performance and reliability roles, and to project work on your product or a client's.**
Reach me through my [GitHub profile](https://github.com/Jayami123).

## What you get

- **A clear answer.** Does the product hold up under load? If not, at what level of traffic does it start to fail?
- **Plain-English findings.** What broke, how often, and what a customer would see. Your developers get the exact
  steps to reproduce it.
- **Checks that keep running.** The same tests run automatically on every change, so a fixed bug can't quietly come back.

## Why you can trust the results

- **I check the checks.** Before I call something a failure, I run the test against a control to prove it measures
  what it claims. Runs that don't hold up are thrown out, not hidden.
- **Every number is automated.** Published numbers come only from automated runs on GitHub Actions, repeated at least
  three times. None come from a laptop.
- **Everything is public.** The tests, the runs and the findings are all in this repository.

## Real products, real failures

I test widely used open-source products, not toy apps.

| Product                            | What it does | The failure I look for                                    |
| ---------------------------------- | ------------ | --------------------------------------------------------- |
| [Medusa](https://medusajs.com)     | Online shop  | Two buyers, one item left                                 |
| [Cal.com](https://cal.com)         | Scheduling   | Two people, one time slot                                 |
| [Documenso](https://documenso.com) | E-signature  | The last signers finishing at the same moment             |
| [Twenty](https://twenty.com)       | CRM          | Edits from several people silently overwriting each other |

Several of the defects I found are already reported to the maintainers of these projects. The full record, with
every test, run and finding, is in [EVIDENCE.md](EVIDENCE.md).

## Let's talk

Whether you're hiring for quality or preparing a product for launch, I'd like to hear what you're worried about
before the release goes out.

---

Built with k6, Playwright, TypeScript, Docker and GitHub Actions.
