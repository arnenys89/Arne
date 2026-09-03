# School AI

Een afgeschermde AI-omgeving voor leerkrachten met Microsoft 365-aanmelding, door de school goedgekeurde sjablonen en centraal beheerde tokenbudgetten.

## Belangrijk

Dit is een server-side webapp en is **niet geschikt om rechtstreeks als GitHub Pages-site te hosten**. GitHub Pages kan geen Node/Express-backend draaien en de OpenAI API-sleutel mag nooit in browsercode staan.

De app is voorbereid voor hosting op bijvoorbeeld Azure App Service, Azure Container Apps, Render of een andere Node.js-host. Microsoft Entra ID levert de authenticatie; de server valideert het bearer-token. De OpenAI API wordt uitsluitend vanuit de server aangeroepen.

Microsoft raadt MSAL Browser aan voor SPA-aanmelding met Microsoft Entra ID en vereist een appregistratie met een geldige client ID en redirect URI. Zie de Microsoft-documentatie: https://learn.microsoft.com/en-us/entra/msal/javascript/browser/login-user

De OpenAI JavaScript SDK gebruikt server-side de Responses API. Bewaar de API key als server-side environment variable. Zie: https://platform.openai.com/docs/quickstart/make-your-first-api-request

## Installatie

1. Maak in Microsoft Entra ID een SPA-appregistratie voor de frontend.
2. Maak een beschermde API-appregistratie/scope voor deze applicatie, bijvoorbeeld `api://<api-client-id>/access_as_user`.
3. Configureer de redirect URI van de SPA op de uiteindelijke domeinnaam.
4. Zet de variabelen uit `.env.example` als environment variables op de server.
5. Voer `npm install` en daarna `npm start` uit.
6. Voeg leerkrachten toe via **Beheer** en ken hun tokenbudget toe.

## Tokenbeheer

De huidige implementatie houdt gebruikers en verbruik bij in `data/users.json`. Dat is bewust eenvoudig gehouden voor een eerste versie. Voor productiegebruik met meerdere serverinstances is een echte datastore (bijvoorbeeld Azure SQL, PostgreSQL of Azure Table Storage) aanbevolen.

## Sjablonen

De goedgekeurde sjablonen staan in `data/templates.json`. De beheerder kan de beschrijving en systeemprompt vanuit de webinterface aanpassen.

## Productierijp maken

Voor een echte schoolomgeving zijn nog aan te raden: persistente database, auditlog, rate limiting, automatische back-ups, fijnmazige Entra-groepen/rollen, CSRF-bescherming waar relevant, content-/privacybeleid, bewaartermijnen en een aparte documentgenerator voor professionele PDF-opmaak.
