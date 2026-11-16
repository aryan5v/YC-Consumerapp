# Clerk accounts

Clerk decides who a person is; `deviceToken` decides which install they are on. Both are always in
play: the app keeps sending its token on every call, and the Convex client attaches the Clerk token on
its own once the providers are mounted, so the backend can tell a guest from an account.

What is in this repo:

| File | What it does |
| --- | --- |
| `backend/convex/auth.config.ts` | Reads the issuer from `CLERK_JWT_ISSUER_DOMAIN` (or `CLERK_FRONTEND_API_URL`) and tells Convex to verify Clerk tokens with `applicationID: "convex"`. With no issuer set the provider list is empty and only guests play. |
| `backend/convex/schema.ts` | `users.clerkUserId` (Clerk's `sub`) with the `by_clerk_user_id` index, and `clerk` as a third `users.kind`. |
| `backend/convex/lib/session.ts` | Resolves every call to a player: the Clerk account's player when the call carries a verified token, else the install's own guest player. |
| `backend/convex/session.ts` | `whoami`, `signInAnonymously`, `signInAs` and `signOut` under those rules. |
| `mobile/src/data/convexProvider.tsx` | `ClerkProvider` (with the SecureStore token cache) around `ConvexProviderWithClerk`, plus `session:signOut`. Without `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` the app is guest-only, exactly as before. |
| `mobile/src/components/SignInSheet.tsx` | The sign-in surface: one email field, one code field, in the app's own idiom. |
| `mobile/src/components/SettingsSheet.tsx` | The Account rows in settings: sign in, or the signed-in address and Sign out. |
| `backend/tests/clerk.test.ts` | The account model end to end, with no network. |

## What this deployment uses

| | |
| --- | --- |
| Clerk application | **Synqui**, `app_3MAMN22j0NUxbuypZbWEDUmgJZi` |
| Development instance | `ins_3MAMMwlOpE14ZqZi8sq4dcO8z6q` |
| Frontend API URL | `https://concise-foal-2985.clerk.accounts.dev` |
| Convex deployment | `reliable-opossum-456` (dev), `CLERK_JWT_ISSUER_DOMAIN` set to that URL |
| Convex token | JWT template `convex`, `claims: {"aud": "convex"}`, created through the CLI |

The app carries the *publishable* key (`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in `mobile/.env`); the
publishable key is public by design and is not a secret. The Clerk **secret** key never reaches the
app or Convex, and no Clerk key is ever a `deviceToken`.

## Setting it up again, or on another Clerk account

1. Create or pick the Clerk application, then make sure it can mint Convex tokens. Either activate the
   **Convex** integration in the dashboard
   ([dashboard.clerk.com/apps/setup/convex](https://dashboard.clerk.com/apps/setup/convex)), or create
   the equivalent JWT template yourself:

   ```bash
   npx -y clerk@latest auth login
   npx -y clerk@latest api /jwt_templates --app <application_id> --instance dev --yes \
     -d '{"name":"convex","claims":{"aud":"convex"}}'
   ```

   Without one of those, every token the app can get is missing `aud: "convex"` and Convex refuses it.
2. Read the instance's Frontend API URL — the publishable key decodes to it:

   ```bash
   npx -y clerk@latest apps list --json   # pk_test_<base64 of "host$">
   ```
3. Set it on the Convex deployment and push:

   ```bash
   cd backend
   npx convex env set CLERK_JWT_ISSUER_DOMAIN https://<host>
   npx convex deploy
   ```
4. Enable the **Native API** for the instance (Clerk Dashboard → Native applications) and add the iOS
   bundle identifier before a production build.
5. Put the publishable key in `mobile/.env` as `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.

## How the app signs in

`mobile/` mounts `ClerkProvider` with `tokenCache` from `@clerk/expo/token-cache` (SecureStore, so the
session survives a restart) inside `ConvexProviderWithClerk`, so Convex attaches the Clerk token to
every call. Settings → Account offers **Sign in**, which opens the email-code sheet: the address is
tried as a sign-in first, and an address with no account yet becomes a sign-up with the same code
(`form_identifier_not_found` → `signUp.create` → `sendEmailCode`). Both paths end in `finalize()`.

The instance currently enables **email code** and **Sign in with Apple**, and no password. Apple
sign-in would be a native addition (`expo-apple-authentication` + a development build) and is not
wired yet.

Two rules the client keeps:

* **Keep sending `deviceToken`.** Every function still requires it; it is what a guest player is made
  of, and it is stored in SecureStore alongside the Clerk session.
* **Call `session:signOut` when signing out of Clerk.** Settings → Account does exactly that, ours
  first and Clerk's second, so the device never keeps reading the account it just left.

## What changes for the player

* Nothing while they are a guest. Their install keeps its own player, streak and live run.
* The first signed-in call on a device whose player is still a guest makes that player the account's,
  so the streak and any live run come along.
* Signing in on a second device lands on the same player and the same streak.
* Signing out hands the device a fresh guest player; the account keeps its streak and its runs.
* `session.whoami` and `users.me` answer `anonymous: false` for a signed-in player, and
  `users.clerkUserId` is Clerk's user id.

## Verifying without the app

`tests/clerk.test.ts` covers the whole model with no network. To prove the live chain — Clerk issues a
token, Convex accepts it, the account's player is the one that answers — mint a real token for a
throwaway user and call the deployment's HTTP API with it:

```bash
# a test user, a session for them, and a token from the convex template
npx -y clerk@latest api /users --app <application_id> --instance dev --yes \
  -d '{"email_address":["clerk-e2e+clerk_test@example.com"],"password":"<random>"}'
npx -y clerk@latest api /sessions --app <application_id> --instance dev --yes -d '{"user_id":"<user_id>"}'
npx -y clerk@latest api /sessions/<session_id>/tokens/convex --app <application_id> --instance dev -X POST
```

Then, with that token in `$TOKEN`:

```bash
curl -s -X POST https://reliable-opossum-456.convex.cloud/api/mutation -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $TOKEN" -d '{"path":"session:signInAnonymously","args":{"deviceToken":"e2e-device-1"},"format":"json"}'
# -> a user id, and session:whoami with the same token answers anonymous:false
curl -s -X POST https://reliable-opossum-456.convex.cloud/api/query -H 'Content-Type: application/json' \
  -d '{"path":"session:whoami","args":{"deviceToken":"e2e-device-1"},"format":"json"}'
# -> null: the same device without the token cannot reach the account's player
```

Delete the test user and the session afterwards
(`npx -y clerk@latest api -X DELETE /users/<user_id> --app <application_id> --instance dev --yes`).
The `users` rows it created on the dev deployment are harmless test data.
