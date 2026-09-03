# OnderwijsAI

Een afgeschermde AI-omgeving voor onderwijsprofessionals met Microsoft 365-aanmelding, schoolgoedgekeurde sjablonen, Microsoft Lists als beheerslaag en server-side OpenAI-generatie.

## Wat is nu gebouwd?

- Professionele responsive frontend met drie werkruimtes: **Sjablonen**, **Genereren** en **Beheer**.
- Microsoft Entra ID / MSAL Browser voor aanmelden.
- Server-side validatie van het Microsoft 365-bearer-token.
- OpenAI Responses API uitsluitend vanuit de server; de API-key komt nooit in browsercode.
- Microsoft Lists/SharePoint-integratie voor gebruikers, sjablonen en gebruiksregistratie.
- Tokenbudget per gebruiker, met verbruik na elke generatie.
- Beheerders kunnen gebruikersbudgetten en sjabloonbeschrijvingen/prompts beheren.
- Tekst- en eenvoudige PDF-output.
- Een JSON-fallback blijft aanwezig zodat de applicatie lokaal kan worden getest vóór Microsoft Lists is ingericht.

## Architectuur

`Microsoft 365 → Entra ID → frontend → beveiligde Node/Express API → Microsoft Graph / Microsoft Lists + OpenAI`

De backend gebruikt de OAuth 2.0 On-Behalf-Of-flow om namens de aangemelde gebruiker Microsoft Graph te benaderen. Dit past bij een frontend → web API → Graph-architectuur. Microsoft documenteert dat OBO gedelegeerde rechten doorgeeft en dat de `.default`-scope voor de downstream resource wordt gebruikt. 

Microsoft Graph biedt hiervoor onder meer `/sites/{site-id}/lists` en `/sites/{site-id}/lists/{list-id}/items`; geef alleen de noodzakelijke Graph-permissies en admin consent. 

## Microsoft Lists

Maak op de gekozen SharePoint-site deze Lists.

### 1. AI Gebruikers

| Kolom | Type | Waarde |
|---|---|---|
| Title | Eén regel tekst | Naam |
| Account | Eén regel tekst | M365 UPN/e-mailadres |
| Rol | Eén regel tekst | `Leerkracht` of `Beheerder` |
| TokenBudget | Getal | Toegewezen tokens |
| TokensGebruikt | Getal | Verbruikte tokens |
| Actief | Ja/Nee | Toegang toegestaan |

### 2. AI Sjablonen

| Kolom | Type | Waarde |
|---|---|---|
| Title | Eén regel tekst | Naam sjabloon |
| TemplateId | Eén regel tekst | Unieke ID, bv. `lesvoorbereiding` |
| Beschrijving | Meerdere regels tekst | Korte uitleg |
| Outputtypes | Eén regel tekst | bv. `PDF; Smartschool` |
| Systeeminstructie | Meerdere regels tekst | Goedgekeurde AI-instructie |
| Actief | Ja/Nee | Beschikbaar voor leerkrachten |
| Volgorde | Getal | Sorteervolgorde, optioneel |

### 3. AI Gebruik

| Kolom | Type | Waarde |
|---|---|---|
| Title | Eén regel tekst | Automatische logregel |
| Account | Eén regel tekst | M365 UPN |
| Sjabloon | Eén regel tekst | Sjabloonnaam |
| InputTokens | Getal | Inputtokens |
| OutputTokens | Getal | Outputtokens |
| TotaalTokens | Getal | Totaal |
| Datum | Datum/tijd | Tijdstip |

## De 10 standaard-sjablonen

1. Lesvoorbereiding — PDF & Smartschool
2. STEM-Project — leerlingenbundel, lerarenbundel & fiches
3. Praktijkproject — werkvoorbereiding & veiligheid
4. Toets — leerling-PDF, leraar-PDF met antwoorden & fiche
5. Opdracht — leerling-PDF, leraar-PDF met antwoorden & fiche
6. Examen — leerling-PDF, leraar-PDF met antwoorden & fiche
7. Activiteit & Uitstap — brief, aanvraag-PDF, mededeling & bericht
8. Oudercommunicatie — brief & Smartschoolbericht
9. Uitnodiging Oudercontact — brief, Smartschool & leidraad
10. Zorg- en Remediëringsplan — GC & IAC

De initiële sjablonen staan in `data/templates.json` en kunnen naar de List worden overgezet.

## Bestaande GitHub Secrets

De eerder aangemaakte secrets kunnen als basis blijven bestaan:

- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_TENANT_ID`
- `OPENAI_API_KEY`

De backend accepteert deze `AZURE_*` aliases naast `M365_*`. Voor de Microsoft Lists-koppeling zijn daarnaast `SHAREPOINT_SITE_ID`, `USERS_LIST_ID`, `TEMPLATES_LIST_ID` en `USAGE_LIST_ID` nodig als server environment variables.

## Entra ID

Voor de eenvoudigste opzet kan één appregistratie zowel de SPA als de beschermde API vertegenwoordigen. Maak een delegated scope zoals `api://<client-id>/access_as_user`, voeg de juiste Microsoft Graph delegated permissions toe voor SharePoint Lists en geef admin consent. De browser vraagt uitsluitend een token voor de eigen API; de server wisselt dat via OBO om voor een Graph-token.

## Starten

```bash
npm install
npm start
```

Configureer de waarden uit `.env.example` in de serveromgeving. Een client secret of OpenAI key mag nooit in `public/`, `index.html` of andere browsercode terechtkomen.

## Volgende productiestappen

- Azure App Service/Container Apps of Azure Static Web Apps met API-deel als hosting.
- HTTPS en correcte Entra redirect URI.
- Graph-permissies zo beperkt mogelijk instellen.
- De Lists-kolommen exact aanmaken en de 10 sjablonen importeren.
- Gebruik eventueel `Lists.SelectedOperations.Selected` als de gekozen Graph-configuratie toegang tot geselecteerde Lists ondersteunt.
- PDF-generator verder uitwerken met schoolhuisstijl, paginering, logo en aparte outputbestanden per outputtype.
- Audit-/bewaarbeleid, rate limiting en foutmonitoring toevoegen.
