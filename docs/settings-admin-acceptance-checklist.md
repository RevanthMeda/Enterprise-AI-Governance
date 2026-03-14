# Settings admin acceptance checklist

Use this after backend or UI changes that affect organization settings.

## Access tab

1. Invite a user and confirm the invite appears in the list.
2. Search invites by email and filter by status.
3. Resend a pending invite and confirm the token refreshes.
4. Revoke a pending invite and confirm the status changes.
5. Search members by name/email/role.
6. Filter members by `active` and `inactive`.
7. Change a member role and confirm the update persists.
8. Deactivate and reactivate a member.
9. Page through invite and member lists when there are more than 8 rows.

## Identity tab

1. Add a new managed domain and save it.
2. Confirm the domain appears with a TXT verification record.
3. Copy the TXT verification record.
4. Publish the TXT record in DNS.
5. Click `Verify DNS` and confirm the domain becomes verified.
6. Set a non-primary domain as primary and confirm the badge changes.
7. Delete a non-primary domain and confirm the remaining list updates.
8. Copy the SSO start URL.
9. Switch auth mode and save identity settings.

## Security tab

1. Start MFA enrollment and confirm QR/secret display.
2. Verify MFA enrollment with a valid TOTP code.
3. Regenerate recovery codes.
4. Disable MFA with valid credentials.

## Activity tab

1. Confirm recent admin actions appear after invite/domain/settings changes.
2. Search activity by action or actor.
3. Filter activity by target type.

## Governance tab

1. Confirm framework status cards render.
2. Confirm geographic scope cards render.
3. Confirm deadlines render.

## Regression anchors

1. `npm run check`
2. `npm run tenant:validate`
3. `npm run test:tenant:isolation`
4. `npm run test:tenant:routes`
5. `npm run test:regression:all`
