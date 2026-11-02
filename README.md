# I test what breaks when many people use a product at the same moment

QA engineer with 2.5 years in industry, open to remote roles and contract work.

This repository is the load and performance testing part of my QA portfolio. A typical load test sends a lot of traffic at a product and charts how fast it responds. I measure speed as well, but my focus is the specific mistakes a product makes when two or more people act at the same instant. Two customers book the same time slot. Two people save the same record. The same request arrives twice. A limit of three lets in a fourth. These failures follow a small number of patterns, and the same patterns show up again and again in very different software.

To prove the method carries over, I ran it against four real open-source products that work like four different businesses. Medusa is an online store, Cal.com is a booking tool, Documenso handles e-signatures and Twenty is a CRM. Across the four I found 6 bugs confirmed in repeat runs. If your product takes bookings, payments, orders or shared edits, I can test it the same way.

## What that looks like in practice

- **A host booked twice for the same hour.** On Cal.com, two people booking overlapping times at once were both accepted in 165 of 180 attempts. Booking one at a time worked fine, so ordinary testing would never catch it. My report is open on Cal.com's public tracker.
- **A booking limit that didn't hold.** On Cal.com, links set to allow only 1 or 3 bookings accepted every extra booking, 600 times out of 600.
- **A contract finished twice.** On Documenso, when the last two people signed together, the document was sealed twice in every one of 200 attempts, and everyone got duplicate completion emails.
- **Half the edits gone without a warning.** On Twenty, when two people updated the same record at once, about half the changes disappeared, and both were told their save worked.
- **Refunds counted twice.** On Medusa, several cancel requests for one paid order arriving at once recorded double the real refund in 684 of 953 attempts.
- **Stock that held up.** Medusa never sold more than it had. Five items in stock, exactly five sold, in all 8 runs. I report what works as well as what breaks.

## Why the numbers hold up

Every number comes from automated runs on GitHub's servers, never from my laptop, and a problem only counts as a bug once repeat runs reproduce it. I also checked everyday speed, where 95% of requests came back in under a quarter of a second, and ran two-hour endurance tests on three of the products.

## Next step

- **To see how it works,** read the [technical details](EVIDENCE.md), with every test, run and method behind these numbers.
- **To talk about a role,** I'm open to remote QA roles.
- **To get your product tested,** I take contract work for startups before a launch or a traffic spike.

**[LinkedIn](https://www.linkedin.com/in/jayamihettigoda/)** · **[Email](mailto:jayami2114@gmail.com)** · [GitHub](https://github.com/Jayami123)

<sub>Built with k6, Playwright, TypeScript, Docker and GitHub Actions.</sub>
