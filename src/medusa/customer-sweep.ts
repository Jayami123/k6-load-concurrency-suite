// The customer sweep of the Medusa cleanup (plan Phase 4b task 10 follow-up). Pure: the caller supplies the page reader and the delete
// call, so the paging is testable without an admin token. The old sweep stopped after 20 pages of 100 and reported success, which left
// customers behind when a run created more than 2000 of them; the leak check then failed the run as a TEST BUG.

export interface CustomerRow {
  id?: string;
  email?: string;
}

export interface CustomerSweepPort {
  /** One page of the customers matching the search, starting at offset. */
  list: (offset: number, limit: number) => Promise<CustomerRow[]>;
  /** Removes one customer by id. */
  remove: (id: string) => Promise<void>;
}

export const CUSTOMER_PAGE_SIZE = 100;
/** A safety bound on the pages read, far above any run's customer count (100 000 customers). */
export const CUSTOMER_MAX_PAGES = 1000;

/**
 * Deletes every customer whose email starts with the prefix (case-insensitive). Pages until a short page ends the list. Returns the
 * number deleted. Throws a TEST BUG when the page bound is reached, so a truncated sweep can never report success.
 */
export async function sweepCustomersByPrefix(
  port: CustomerSweepPort,
  prefix: string,
  opts: { pageSize?: number; maxPages?: number } = {},
): Promise<number> {
  const pageSize = opts.pageSize ?? CUSTOMER_PAGE_SIZE;
  const maxPages = opts.maxPages ?? CUSTOMER_MAX_PAGES;
  const wanted = prefix.toLowerCase();
  let deleted = 0;
  let offset = 0;
  for (let page = 0; page < maxPages; page += 1) {
    const customers = await port.list(offset, pageSize);
    if (customers.length === 0) return deleted;
    let kept = 0;
    for (const customer of customers) {
      if (customer.id && customer.email?.toLowerCase().startsWith(wanted)) {
        await port.remove(customer.id);
        deleted += 1;
      } else {
        kept += 1;
      }
    }
    // a short page is the last page of the list
    if (customers.length < pageSize) return deleted;
    // deleted customers leave the list, so only the kept ones move the offset
    offset += kept;
  }
  throw new Error(
    `TEST BUG: customer sweep stopped after ${maxPages} pages with customers still listed for ${prefix}`,
  );
}
