# I find where your product breaks when everyone uses it at once

Most products pass when one person tries them. They fail when many people act at the same moment: two buyers take the
last item, two people book the same slot, two signers finish the same document. These failures cost money and trust,
and a normal test never shows them.

I'm a QA engineer who finds these failures before your customers do, and tells your team exactly how to fix them.

**Open to full-time QA, performance and reliability roles, and to project work on your product or a client's.**
Reach me through my [GitHub profile](https://github.com/Jayami123).

## The proof

Each result below traces to an automated run recorded in [EVIDENCE.md](EVIDENCE.md).

### Stock held: five in stock, five sold, never more

**Medusa, an online shop.** Many buyers went for five items at the same moment. The shop sold exactly five, in all eight
recorded runs. With two servers sharing one database, the stock still held.

_This protects you from selling stock you don't have._

### One slot, one booking

**Cal.com, scheduling.** A large burst of booking requests for the same slot: exactly one was accepted, in every run.

I also found a gap. Two overlapping bookings on one host were both accepted. The maintainers have it reported as a
high-severity issue ([cal.diy#30374](https://github.com/calcom/cal.diy/issues/30374)).

_This protects you from double-booked calendars._

### Two signers, one document, sealed twice

**Documenso, e-signature.** When the last two people signed at the same moment, the document was sealed twice in 50
of 50 attempts. With signers one at a time, it sealed once every time, so the test itself is sound. The maintainers have
the report ([documenso#3187](https://github.com/documenso/documenso/issues/3187)).

_This protects legal documents from being finalized twice._

### One reset link, ten uses, all accepted

**Twenty, CRM.** A single password-reset link, used ten times at the same moment: all ten succeeded. I've held the details
back from public view, because the maintainers' security policy asks for private reports.

_This protects one link, one use._

### Edits silently overwritten

**Twenty, again.** Two people editing the same record at once: about half of the changes vanished, and both saw success.
This is a design gap. I've written it up as a request for the maintainers, and it is not filed yet.

_This protects work your team doesn't lose without knowing._

### Load tests that hold

Ten load tests across three products, each run three times on GitHub's servers. Every one passed its valid run, and no
planned visit was dropped.

_This means the everyday journeys work under sustained traffic, not only on a quiet afternoon._

### How I check myself

- **Controls.** Every risky test runs next to a control that should pass. If the control fails, the test is wrong, not the
  product.
- **Repeats, from CI only.** Numbers come only from automated runs on GitHub Actions, repeated at least three times.
  Nothing comes from my laptop.
- **Bad runs are thrown out, and listed.** A run whose setup broke is excluded, and the reason is recorded, not hidden.
- **The tools have tests too.** Over 1,500 automated checks run on every change.

### What's still open

I'd rather tell you than have you find it:

- I report a range of load a product handles, not a single maximum.
- Two-hour runs suggest memory creeps up on Cal and Documenso. I've flagged it as suspected, not proven.
- The weekly endurance trend is still collecting. It needs three weeks of data.
- One of my own checks showed a timing difference I haven't explained yet. It's logged, not hidden.

## What you get

- **A clear answer.** Does the product hold under load, and where does it start to strain?
- **Plain-English findings.** What broke, how often, what a customer would see, and the steps to reproduce it.
- **Checks that keep running.** The same tests run on every change, so a fixed bug can't quietly come back.

## Let's talk

Whether you're hiring for quality or preparing a product for launch, tell me what you're worried about before the release
goes out.

---

Built with k6, Playwright, TypeScript, Docker and GitHub Actions.
