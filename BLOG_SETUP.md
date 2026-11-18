# DownMyVid Blog Setup

## Routes
- Public index: `/blog`
- Public article: `/blog/<slug>`
- Private author/editor: `/admin`

## Firebase Console setup
1. Enable Google under Firebase Authentication > Sign-in method.
2. Add the production hosting domains to Authentication > Settings > Authorized domains.
3. Confirm the configured Firestore database exists and is enabled.
4. Firebase Storage image upload is implemented and ready, but may require a billing-plan upgrade depending on project/bucket eligibility. No billing changes are made by this application.
5. Deploy the Firestore and Storage rules in `firestore.rules` and `storage.rules` before allowing users to sign in or publish.

## Security model
The admin UI and Firestore/Storage rules allow publishing only for `journeysailblog@gmail.com`. Anonymous visitors can query/read published post documents only. Drafts are restricted to the admin. Storage image reads are public for published image URLs; writes are limited to the admin's own `blog-images/<uid>/` folder, image MIME types, and files under 8 MB. The site does not provide public sign-up.

The editor accepts either an uploaded image or a public image URL. If Firebase Storage is unavailable under the current plan, the URL field remains an option until the project is upgraded/configured.

This client-rendered SPA updates article metadata after the article loads. For complete SEO/social preview metadata before JavaScript runs, consider later adding server-rendered/static article pages or a metadata-rendering service; current blog links and text are crawlable via client rendering but social crawlers may not execute the app.
