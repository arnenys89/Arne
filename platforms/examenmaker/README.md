# Examenmaker binnen SAPOOV

De Examenmaker is volledig geïntegreerd in het centrale SAPOOV-platform.

## Productieconfiguratie

- Publieke route: `https://www.sapoov.be/examenmaker`
- Dashboardlink: `/examenmaker`
- Centrale Worker: `sapoov`
- Worker-broncode: `platforms/sapoov-dashboard/worker.js`
- GitHub-branch: `feature/sapoov-central-dashboard`
- Centrale toegangscontrole: Cloudflare Access op `www.sapoov.be`
- Rechtencontrole: SAPOOV Identity API, toepassing `examenmaker`
- Centrale rollen: Administrator (`*`), Leerkracht (`exams.create`, `exams.manage_own`) en Teamleider (`exams.manage_team`)
- Bestaande database: D1 `richtpunt-examenmaker`, gekoppeld aan de centrale Worker als binding `DB`
- SAPO-leerplannen: rechtstreekse API-koppeling via de bestaande `SAPO_API_KEY` Worker-secret op de centrale Worker

## Behouden gegevens

De oorspronkelijke D1-database is behouden en niet leeggemaakt. De bestaande tabellen `users` en `exams` blijven de primaire gegevensbron.

## Functionele onderdelen

- Aanmelden via de centrale Cloudflare Access-identiteit.
- Autorisatie via de centrale SAPOOV Identity API.
- Examens aanmaken, bewaren, openen en verwijderen.
- SAPO-leerplannen en leerplandoelen ophalen en selecteren.
- Examen en verbetersleutel exporteren naar Word en PDF.
- Zelfevaluatie en foutenbibliotheek opnemen in de examenoutput.

## Migratie afgerond

De Examenmaker draait via de centrale SAPOOV Worker. De gebruiker heeft bevestigd dat de geïntegreerde versie werkt. De oude Cloudflare Access-toepassing is verwijderd. De oude afzonderlijke Worker was niet meer aanwezig in het Cloudflare-account. De oude Worker-broncode `legacy-worker.js` is uit deze branch verwijderd.

De oorspronkelijke D1-database `richtpunt-examenmaker` blijft bewust behouden en is gekoppeld aan de centrale Worker. Er is geen oude database of examengegevens verwijderd.
