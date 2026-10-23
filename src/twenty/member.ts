import { requestPasswordReset, sendInvitation, signUpFromInvite } from "./api.ts";
import { freshPassword } from "./payloads.ts";
import { inviteFrom, resetTokenFrom, waitForMessage } from "./mailpit.ts";
import type { CaseContext } from "./run-case.ts";

/** Invite a fresh address, read the invite mail, and sign up through it. Every failure is a setup error (TEST BUG). */
export async function createInvitedMember(
  ctx: CaseContext,
  address: string,
): Promise<{ address: string; password: string }> {
  const inv = await sendInvitation(ctx.base, ctx.auth, address);
  if (inv.status !== 200 || inv.json?.errors) {
    throw new Error(`TEST BUG: sendInvitations returned HTTP ${inv.status}`);
  }
  const invite = inviteFrom(
    await waitForMessage({ mailpitUrl: ctx.mailpitUrl, address, subject: /join|invit/i }),
  );
  if (!invite) throw new Error("TEST BUG: no invite link in the invite mail");
  const password = freshPassword();
  const su = await signUpFromInvite(ctx.base, address, password, invite);
  if (su.status !== 200 || su.json?.errors) {
    throw new Error(`TEST BUG: signUpInWorkspace returned HTTP ${su.status}`);
  }
  return { address, password };
}

/** Request a reset for a member and return the 64-hex token from the reset mail. The token stays in memory (D8). */
export async function requestResetToken(ctx: CaseContext, address: string): Promise<string> {
  const rq = await requestPasswordReset(ctx.base, address, ctx.workspaceId);
  if (rq.status !== 200 || rq.json?.errors) {
    throw new Error(`TEST BUG: emailPasswordResetLink returned HTTP ${rq.status}`);
  }
  const token = resetTokenFrom(
    await waitForMessage({ mailpitUrl: ctx.mailpitUrl, address, subject: /password/i }),
  );
  if (!token) throw new Error("TEST BUG: no reset token in the reset mail");
  return token;
}
