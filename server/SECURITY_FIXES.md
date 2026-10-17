# Security & bug-fix notes

## Do these before deploying
1. **Rotate JWT_SECRET.** The old `.env.example` shipped the public jwt.io sample token; if any environment used it, anyone can forge an admin login. Generate: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. The server now refuses to start with that value or a placeholder.
2. **Run `node scripts/rotate-professor-passwords.js`** (use `--dry-run` first). Professors previously had the password `IIT@INDORE#<COURSE CODE>`; the course code is public and professor emails were exposed to students.
3. Set `TRUST_PROXY=1` (or the proxy count) if behind nginx/a load balancer, otherwise rate limiting sees one IP.
4. `ALLOW_SELF_REGISTRATION` defaults to **false in production** (true in dev). See below.

## Behaviour changes
- `POST /courses/professors` now returns a one-time `temporaryPassword` (shown once to the admin). Professors have `mustChangePassword: true` and must call the new `POST /auth/change-password`; changing it revokes older tokens. The client needs a screen for this.
- `GET /courses/available` no longer returns `professorEmail` to students.
- Students only see finalized sessions in `/students/attendance`.
- `/api/files/*` is now limited to files belonging to the professor's own sessions / courses / cohorts (admins: all).
- Rejected enrollment photos are deleted.
- `studentProfile.courseId` must be a valid id; `year` is required when requesting enrollment.

## Fixed bugs
- Server crashed at startup on Express 5 (`/*` route in files.routes.js).
- Deleting a course always threw (`AttendanceSession` destructured from a default export).
- Changing a course's professor threw (`.equals` on a string).
- Students could never view their own record (compared Student `_id` with the business id).
- `GET /students/attendance` crashed when a record's session was missing, and counted unfinalized sessions.
- `validate()` assigned to `req.query`, which throws on Express 5.
- Google sign-in errors became raw 500 JSON instead of a redirect to the login page.
- Professors could be created with non-institutional emails that could never log in.
- Approving an enrollment dropped the embedding model name, wasn't atomic (double approve), and could leave half-applied state.
- Temp upload files leaked on several early-exit paths; temp cleanup now also runs every 30 min.
- Null-safety in review sort / finalize when a student record was deleted.
- Adding a student to a session during review didn't check they belong to that course.

## Security fixes
- Predictable professor passwords removed (see above).
- Face embeddings (biometric data) were returned to the browser inside `session.analysis`; now stripped.
- CSV export formula injection (`=`, `+`, `-`, `@`) neutralised; export filenames sanitised.
- File route: strict filename allowlist, no double URL-decoding, symlink escape check, per-file ownership.
- Google login now requires a verified email; error text is no longer reflected to the browser.
- Roll-number takeover: a second account can no longer link to / be approved onto a student already linked to another account.
- Per-account login throttling (failed attempts only) in addition to per-IP; global rate limit; `Cache-Control: no-store` on API responses.
- Login no longer leaks account existence via timing; password length capped to bcrypt's 72 bytes for new passwords.
- Stale `.bak` copies of old code removed from `src/`.

## Known remaining risks (need a product/client decision)
- **Self-registration cannot prove email ownership.** With it on, whoever logs in first with `victim@iiti.ac.in` owns that account. Prefer Google sign-in only, or add emailed verification.
- **Google token is passed in the redirect URL query** (`/login?token=...`). Moving it to a URL fragment (`#token=`) needs a small client change.
- **`?token=` on file URLs** puts a JWT in URLs/logs. Safer: short-lived signed file URLs or fetching images with the Authorization header and using blob URLs.
- JWTs live 8h and are only revoked on password change.
- Professors can delete *finalized* sessions (`DELETE /attendance/sessions/:id`).
- `tests/e2e.test.js` logs in with `@x.io` addresses, which the institutional-domain check rejects, so it needs updating; it requires a live MongoDB and ML mock and was not run here.
