# Draft: Cal private link usage count is one higher than the bookings that used it

Draft for the Cal bug report (`.github/ISSUE_TEMPLATE/bug_report.md`). Not filed. The owner files it.

### Issue Summary

In the load case `P6-CAL-LOAD-009`, one cap-1 private link per intent is set on an event type, then one booking per intent
is made through its link. In one CI run the link usage count was 31 where the bookings that used the links were 30. The
cause is not established. Whether Cal or the test is wrong is not established either.

### Steps to Reproduce

1. Set one private link per planned intent plus 2 spares on an event type, each with `maxUsageCount` 1.
2. Make one booking per planned intent, each through a different link, at a constant arrival rate.
3. Read each link's `usageCount` and count the bookings whose attendee email matches the intent.

### Actual Results

In run 40135722015, one link showed one more use than the bookings that carried its id. Three later runs of the same case
passed with the counts equal (40142908660, 40144142420, 40145366743): the mismatch appeared in one of four runs.

### Expected Results

For each link, `usageCount` equals the number of bookings that used it, and no booking is accepted on a link at its cap.

### Technical details

- The case records a per-intent join of bookings and link usage in `retry-audit.json` (`judgeCalLinkJoin`).
- Node.js and the Cal ref are recorded in the run-meta of each run.

### Evidence

- The per-intent join rows of run 40135722015 (`retry-audit.json`, the failing run).
- The three later runs above, which passed.
