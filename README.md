# CoupleConnect

Firebase-connected couple web app built with React + Vite.

## Features

- Email/password signup and login
- Create or join a Couple ID
- Shared couple password
- Profile A / Profile B
- Home section with latest partner status
- Quick camera snip and photo upload
- Realtime snap feed using Firestore base64 images
- Map section with consent-based location sharing
- Settings section
- Private chat inside settings
- Netlify deploy ready
- Firebase Hosting ready

## Important

Firebase Storage is not used because it may require a paid plan. Snaps are compressed and stored in Firestore for prototype/demo use.

## Correct file structure

```text
package.json
index.html
netlify.toml
firebase.json
firestore.rules
src/
  main.jsx
  App.jsx
  firebase.js
  styles.css
```

## Netlify deployment settings

```text
Build command: npm run build
Publish directory: dist
```

## Local run

```bash
npm install
npm run dev
```

## Firebase Hosting deployment

```bash
npm install
npm run build
firebase login
firebase use coupleconnect-a6c1d
firebase deploy
```

## Firebase services needed

- Authentication: Email/Password enabled
- Firestore Database enabled
- Firestore rules published
