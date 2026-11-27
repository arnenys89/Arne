# SAPOOV Activiteitenplatform

Geïntegreerd onder `https://www.sapoov.be/activiteitenplatform`.

- Worker-broncode: `worker.js`
- Centrale identiteit en autorisatie: SAPOOV Identity API, applicatie-ID `activiteitenplatform`
- Centrale D1: `sapoov-central-identity`, binding `DB`
- Datalagen: `db/migrations/0001_activities.sql`

De applicatie gebruikt de centrale `users`- en `user_app_roles`-tabellen. De oorspronkelijke aparte D1 bevatte geen activiteit- of gebruikersrecords; er is dus geen lokale data die verloren gaat bij deze overstap.

De Worker wordt gekoppeld aan `www.sapoov.be/activiteitenplatform*`. De browser gebruikt `/activiteitenplatform/api/*`; de Worker verwijdert intern het prefix voor de bestaande API-handlers.

De centrale Access-app van SAPOOV beschermt de route. De server stuurt de originele Access-JWT door naar de SAPOOV Identity API. Rollen en permissions worden nooit uit browserinvoer vertrouwd.
