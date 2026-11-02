# Load testing: what breaks when many people use a product at once

I'm a QA engineer. This repository is my load and concurrency test suite for four open-source products: an online shop
(Medusa), a scheduling tool (Cal.com), an e-signature tool (Documenso) and a CRM (Twenty).

Every result below comes from an automated run on GitHub's servers. Each run is linked, and the full record is in
[EVIDENCE.md](EVIDENCE.md).

**Open to full-time QA or performance roles, and to contract work on a product or a client's launch.**
Contact: [GitHub profile](https://github.com/Jayami123)

## Results at a glance

| Product           | What I tested                             | Result                                                | Status                  |
| ----------------- | ----------------------------------------- | ----------------------------------------------------- | ----------------------- |
| Medusa (shop)     | 5 items in stock, buyers at the same time | 5 sold, 0 oversold, in 8 of 8 runs                    | Passed                  |
| Cal.com (booking) | One time slot, requests at the same time  | 1 booking accepted, in 7 of 7 runs                    | Passed                  |
| Cal.com (booking) | Two overlapping bookings on one host      | Both accepted, so the host is double-booked           | Reported upstream       |
| Cal.com (booking) | Private links with limits of 1 and 3      | Every attempt over the limit accepted, 600 of 600     | Existing upstream issue |
| Documenso (sign)  | Last two signers sign at the same moment  | Document sealed twice, 50 of 50 attempts              | Reported upstream       |
| Twenty (CRM)      | One password-reset link used at once      | More than one success, 250 of 250 attempts            | Private report          |
| Twenty (CRM)      | Two people edit one record at once        | About half of the changes lost, in 3 of 3 runs        | Written up, not filed   |
| Twenty (CRM)      | Five other race tests                     | No problem found                                      | Passed                  |
| Three products    | Ten load tests, each run three times      | All passed their valid runs, no planned visit dropped | Passed                  |

Statuses follow the repo's own rule: a problem is called a bug only after repeated full runs reproduce it.

## Details

<details>
<summary><b>Medusa: stock held under simultaneous buyers (8 runs)</b></summary>

Five items in stock, and many buyers at the same moment. The test passes only if exactly five are sold and none are sold
twice.

| Run                                                                                            | Trigger  | Sold | Oversold |
| ---------------------------------------------------------------------------------------------- | -------- | ---- | -------- |
| [39429276298](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39429276298) | push     | 5    | 0        |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push     | 5    | 0        |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | 5    | 0        |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | 5    | 0        |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | 5    | 0        |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | 5    | 0        |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | 5    | 0        |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | 5    | 0        |

</details>

<details>
<summary><b>Cal.com: one slot, one booking (7 runs), and the overlap gap</b></summary>

A burst of booking requests for the same slot. The test passes when exactly one request is accepted.

| Run                                                                                            | Trigger  | Accepted | Refused |
| ---------------------------------------------------------------------------------------------- | -------- | -------- | ------- |
| [39434721131](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39434721131) | push     | 1        | 950     |
| [39449102426](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39449102426) | push     | 1        | 950     |
| [39484324139](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39484324139) | push     | 1        | 950     |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | push     | 1        | 950     |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | schedule | 1        | 950     |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | push     | 1        | 950     |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | dispatch | 1        | 950     |

The gap is a different case. Two bookings for overlapping times on the same host are both accepted when they arrive at
the same moment. Sequential bookings are refused correctly. The maintainers have it as a high-severity report:
[cal.diy#30374](https://github.com/calcom/cal.diy/issues/30374).

</details>

<details>
<summary><b>Documenso: document sealed twice when the last two sign together (4 runs)</b></summary>

The control runs the same signing with one signer at a time. Each run is listed separately.

| Run                                                                                            | Race: last two sign together | Control: one at a time |
| ---------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------- |
| [39561220290](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39561220290) | 50 of 50 sealed twice        | 5 of 5 sealed once     |
| [39563393657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39563393657) | 50 of 50 sealed twice        | 5 of 5 sealed once     |
| [39577832657](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39577832657) | 50 of 50 sealed twice        | 5 of 5 sealed once     |
| [39580025937](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/39580025937) | 50 of 50 sealed twice        | 5 of 5 sealed once     |

Each double seal also sends a second set of completion emails and webhooks. The maintainers' report is
[documenso#3187](https://github.com/documenso/documenso/issues/3187).

</details>

<details>
<summary><b>Twenty: reset link and edits (3 runs for edits)</b></summary>

- **Password-reset link.** One link, used ten times at the same moment. In 250 of 250 attempts, more than one request
  succeeded. Details are held back because the maintainers' security policy asks for a private report.
- **Two people editing one record.** The stored value lost about half of the increments in every run. Both writers got
  a success response each time, so nobody is told the edit was lost.

| Run                                                                                            | Increments lost |
| ---------------------------------------------------------------------------------------------- | --------------- |
| [40896799127](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40896799127) | 49.86%          |
| [40896827889](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40896827889) | 49.93%          |
| [40896870640](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40896870640) | 49.93%          |

The write-up is a feature request for the maintainers, drafted but not filed yet.

</details>

<details>
<summary><b>Load tests: ten cases, three runs each (medians)</b></summary>

Each value is the median of three automated runs on GitHub's servers. Runs are from the
[Phase 3 release](https://github.com/Jayami123/k6-load-concurrency-suite/releases/tag/p6-phase3). One first attempt failed
a setup check and was rerun. The excluded attempts are listed in [EVIDENCE.md](EVIDENCE.md).

| Product   | Test        | Requests | Dropped | Response time, 95% of requests (ms) |
| --------- | ----------- | -------- | ------- | ----------------------------------- |
| Cal.com   | Load test 1 | 124      | 0       | 77.12                               |
| Cal.com   | Load test 2 | 152      | 0       | 66.97                               |
| Cal.com   | Load test 3 | 157      | 0       | 120.30                              |
| Medusa    | Load test 1 | 272      | 0       | 171.60                              |
| Medusa    | Load test 2 | 185      | 0       | 165.09                              |
| Medusa    | Load test 3 | 343      | 0       | 217.80                              |
| Documenso | Load test 1 | 281      | 0       | 233.13                              |
| Documenso | Load test 2 | 281      | 0       | 230.11                              |
| Documenso | Load test 3 | 467      | 0       | 88.25                               |
| Documenso | Load test 4 | 281      | 0       | 232.38                              |

These show that the everyday journeys work under sustained traffic. They do not show how much load each product can take.

</details>

<details>
<summary><b>How I check my own results</b></summary>

- **Control runs.** Each risky test has a control that should pass. Documenso's control sealed once in every run above.
- **Repeats.** Medians come only from automated runs, with at least three runs each. Nothing is taken from a laptop.
- **Noise check (A/A).** The same test is run twice with a setting switched, to see how much the results vary by chance.
  The gate allows up to 0.10 of variation.

| Run                                                                                            | Order     | Variation | Verdict |
| ---------------------------------------------------------------------------------------------- | --------- | --------- | ------- |
| [40850333800](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40850333800) | on first  | 0.0072    | Pass    |
| [40848345879](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40848345879) | off first | 0.1269    | Flagged |
| [40857206947](https://github.com/Jayami123/k6-load-concurrency-suite/actions/runs/40857206947) | off first | 0.1148    | Flagged |

I haven't explained the two flagged runs yet. They are logged, not hidden.

- **Bad runs.** A run with a broken setup is excluded and listed in [EVIDENCE.md](EVIDENCE.md).
- **The tools have tests.** 1,573 automated checks run on every change.

</details>

## What's still open

| Item                                   | Status                 | What closes it                              |
| -------------------------------------- | ---------------------- | ------------------------------------------- |
| Load range for Twenty                  | Not run yet            | A load-range run, recorded the same way     |
| Weekly endurance trend                 | 0 of 3 weeks collected | Three Sunday captures, earliest 15 Nov 2026 |
| Memory growth on Cal.com and Documenso | Suspected, not proven  | More two-hour runs and profiling            |
| Two flagged noise-check runs           | Cause not found        | Find the cause, then rerun                  |
| Twenty edit issue and reset-link issue | Not filed or held back | Maintainer response                         |

I report load as a range a product handles, not a single maximum number.

## Tools

k6 for load tests, Playwright for browser tests, TypeScript, Docker and GitHub Actions.
