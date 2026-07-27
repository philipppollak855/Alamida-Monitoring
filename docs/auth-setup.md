# Anmeldung (Google) und Benutzer-Freischaltung

## Firebase Console (einmalig)

1. [Firebase Console](https://console.firebase.google.com/project/alamida---monitoring/authentication/providers)
2. **Authentication** → **Sign-in method** → **Google** aktivieren
3. **Authorized domains**: `alamida---monitoring.web.app` und `localhost` prüfen
4. **Firestore Rules** deployen:
   ```cmd
   cd firebase
   firebase deploy --only firestore:rules --project alamida---monitoring
   ```

## Ablauf für Benutzer

1. Web öffnen: https://alamida---monitoring.web.app
2. **Mit Google anmelden** (erste Anmeldung legt Dokument `users/{uid}` an, `activated: false`)
3. Seite **„Konto wartet auf Freischaltung“** — noch keine Sterbefall-Daten
4. Nach Freischaltung: Zugriff auf `/` und `/wall`

## Administrator: Benutzer aktivieren

1. Firebase Console → **Firestore** → Collection **`users`**
2. Dokument der Person (UID steht auf der Warte-Seite oder in Authentication → Users)
3. Feld setzen:
   - `activated` → **true** (boolean)
   - optional `activatedAt` → Timestamp (jetzt)
4. Benutzer klickt **Status prüfen** oder lädt die Seite neu

### Beispiel-Dokument `users/{uid}`

| Feld | Wert |
|------|------|
| email | user@example.com |
| displayName | Max Mustermann |
| activated | **true** |
| createdAt | (automatisch) |

## Sicherheit

- **Sterbefaelle**, **ueberfuehrungen**, **events**: nur lesbar mit `activated == true`
- Schreiben weiterhin nur über den Windows-Agent (Admin SDK / OAuth)
- Benutzer können `activated` nicht selbst auf `true` setzen (Firestore Rules)

## Web deployen

```cmd
scripts\deploy-web.ps1
```

Deployt Hosting; Rules separat mit `firebase deploy --only firestore:rules`.

### GitHub Actions (CI)

Repository-Secrets (Settings → Secrets and variables → Actions):

| Secret | Quelle |
|--------|--------|
| `FIREBASE_TOKEN` | `npx firebase-tools login:ci` |
| `VITE_FIREBASE_API_KEY` | Firebase Console → Projekteinstellungen → Web-App |
| `VITE_FIREBASE_APP_ID` | dieselbe Web-App |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | dieselbe Web-App |
| `VITE_FIREBASE_AUTH_DOMAIN` | optional, Default `alamida---monitoring.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | optional, Default `alamida---monitoring` |
| `VITE_FIREBASE_STORAGE_BUCKET` | optional, Default `alamida---monitoring.firebasestorage.app` |

Ohne `VITE_FIREBASE_API_KEY` / `VITE_FIREBASE_APP_ID` baut CI eine App ohne Auth („Firebase Auth nicht konfiguriert“).
