# OnderwijsAI

Een afgeschermde AI-omgeving voor onderwijsprofessionals met goedgekeurde sjablonen, tokenbudgetten en centrale administratie.

## Microsoft-login

De gebruikersaanmelding is **niet gekoppeld aan één tenant**. De applicatie gebruikt Microsoft `common` en is bedoeld voor zowel:

- werk- en schoolaccounts;
- persoonlijke Microsoft-accounts.

De Entra-appregistratie moet daarom worden ingesteld op **Accounts in any organizational directory and personal Microsoft accounts** (`AzureADandPersonalMicrosoftAccount`).

Na de login bepaalt OnderwijsAI via de eigen gebruikerslijst of het account AI-toegang en een tokenbudget heeft.

## Microsoft Lists

De applicatie kan Microsoft Lists gebruiken als centrale databron voor:

- `AI Gebruikers`
- `AI Sjablonen`
- `AI Gebruik`

Voor SharePoint gebruikt de server een app-only Graph-token. De SharePointtenant is uitsluitend de locatie van de schooldata en vormt **geen loginbeperking**.

## Beveiliging

De OpenAI API-key wordt uitsluitend server-side gebruikt. Zet secrets nooit in `public/` of in browser-JavaScript.

## Hosting

De applicatie is een Node/Express-webapp en is niet bedoeld voor rechtstreekse hosting als statische GitHub Pages-site. Geschikte hosting is bijvoorbeeld Azure App Service, Azure Container Apps of een andere Node.js-host.

## Configuratie

Zie `.env.example` en `docs/MICROSOFT-LISTS-INSTALL.md` voor de configuratie van Microsoft-login, SharePoint Lists en de server.
