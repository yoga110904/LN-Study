# LN-STUDY

Vanilla JS SPA for reading lecture-note summaries (summary, terms, quiz). Firebase Auth + Firestore, deployable to GitHub Pages without a build step.

## Setup
1. **Firebase Console → Project settings → Your apps (Web)**: copy the config into `js/firebase-config.js`.
2. **Authentication → Sign-in method**: enable **Google**.
3. **Authentication → Settings → Authorized domains**: add `USERNAME.github.io` (and `localhost` for local testing).
4. **Admin**: put your email (lowercase) in `ADMIN_EMAILS` in `js/firebase-config.js` **and** in `isAdmin()` in `firestore.rules`. Both lists must match; the rules are what actually protect the data.
5. **Firestore → Rules**: paste the contents of `firestore.rules`, then Publish.
6. Sign in as the admin, open **People** in the sidebar, and add allowed emails (`name@gmail.com`) or whole domains (`aaa.com`). No need to create whitelist documents by hand.

Users who sign in without being on the list see a "You need access" page.

## Run locally
ES modules need an HTTP server (don't open the file directly):
```
python3 -m http.server 5500
```
Open http://localhost:5500

## Deploy to GitHub Pages
Push this folder to a repo → Settings → Pages → Branch `main`, folder `/root`.

## Routes
`#/login`, `#/courses`, `#/course/:id`, `#/course/:id/week/:weekId`, `#/upload`
