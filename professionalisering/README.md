# Professionalisering — SAPOOV

Frontend voor het bestaande Professionalisering-gedeelte van `sapoov-identity-api`.

## Wat zit erin
- Overzicht van aanvragen en status.
- Aanvraagformulier voor personeelsleden.
- Lesroosterimpact met klaskeuze uit de centrale lijst van 90 klassen (Ninove en Zottegem).
- Goedkeuren/afkeuren voor gebruikers met beoordelingsrechten.
- Auditlog voor beheerders.
- Huisstijl op basis van SAPOOV: geel `#d7ad01`, grijs, wit en zwart.
- Geen eigen login: de app verwacht een geldige SAPOOV/Cloudflare Access-sessie.

## API-contract
De frontend gebruikt same-origin requests naar:
- `GET /api/professionalisering/me`
- `GET /api/professionalisering/school-years`
- `GET /api/professionalisering/applications`
- `POST /api/professionalisering/applications`
- `POST /api/professionalisering/applications/:id/decision`
- `GET /api/professionalisering/audit`

De API controleert zelf de identiteit, applicatietoewijzing en rechten. De frontend vertrouwt niet op browserrollen voor autorisatie.

## Configuratie en publicatie
1. Publiceer deze map als statische assets achter dezelfde Cloudflare Access-beveiliging als SAPOOV.
2. Configureer een same-origin route/proxy zodat `/api/professionalisering/*` naar de bestaande `sapoov-identity-api` gaat. Laat de API-authenticatie en -autorisatie intact.
3. Registreer de applicatie in de centrale identity-database met de slug `professionalisering` en ken rollen/rechten toe.
4. Configureer daarna pas het definitieve productiedomein en eventuele Microsoft Entra/OIDC-registratie. Deze frontend voegt geen afzonderlijke login toe.

## Belangrijke beperking
De bestaande identity-API bevat de Professionalisering-routes, maar de Entra-appregistratie, productiehostnaam en secrets waren in de bestaande projectdocumentatie nog niet geconfigureerd. Deze repositorywijziging bouwt de frontend; ze activeert geen niet-bestaande loginconfiguratie of domein.
