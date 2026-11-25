# Examenmaker binnen SAPOOV

De Examenmaker draait binnen de centrale SAPOOV Worker en gebruikt de centrale SAPOOV-toegangscontrole.

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

De oorspronkelijke D1-database is niet vervangen of leeggemaakt. De bestaande tabellen `users` en `exams` zijn behouden. Bij de integratiecontrole bevatte de database één gebruiker en één examen.

## Functionele onderdelen

- Aanmelden via de centrale Cloudflare Access-identiteit.
- Autorisatie via de centrale SAPOOV Identity API.
- Examens aanmaken, bewaren, openen en verwijderen.
- SAPO-leerplannen en leerplandoelen ophalen en selecteren.
- Examen en verbetersleutel exporteren naar Word en PDF.
- Zelfevaluatie en foutenbibliotheek opnemen in de examenoutput.

## Migratie- en opruimstatus

De centrale Worker bevat de Examenmaker-handler. De oude database blijft behouden als primaire databron. De oude Access-toepassing en eventuele oude Worker mogen pas worden verwijderd nadat de volledige praktijktest is afgerond, inclusief login, SAPO-leerplannen, bewaren/openen van examens en de vier exportvarianten.

## Nog te valideren in de praktijktest

1. Toegang via de SAPOOV-dashboardtegel.
2. Aanmelden en rechtencontrole met een leerkrachtaccount.
3. Een nieuw examen aanmaken, bewaren, sluiten en opnieuw openen.
4. Een bestaand examen openen en aanpassen.
5. SAPO-leerplannen en doelen laden en selecteren.
6. Examen naar Word en PDF exporteren.
7. Verbetersleutel naar Word en PDF exporteren.
8. Controleren dat gebruikers elkaars examens niet kunnen openen of aanpassen.
