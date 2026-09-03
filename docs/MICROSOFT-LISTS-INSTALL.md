# Microsoft Lists instellen voor OnderwijsAI

## 1. Maak één SharePoint-site voor de applicatie

Gebruik een bestaande schoolsite of een aparte beheer-/ICT-site. Noteer de **site ID** van die site voor `SHAREPOINT_SITE_ID`.

## 2. Maak de drie Lists

### AI Gebruikers

Maak deze kolommen:

- Title — Eén regel tekst
- Account — Eén regel tekst
- Rol — Eén regel tekst
- TokenBudget — Getal
- TokensGebruikt — Getal
- Actief — Ja/Nee

Voeg minstens één beheerder toe:

- Account = het M365-account van de beheerder
- Rol = `Beheerder`
- TokenBudget = bijvoorbeeld `1000000`
- TokensGebruikt = `0`
- Actief = `Ja`

### AI Sjablonen

Maak:

- Title — Eén regel tekst
- TemplateId — Eén regel tekst
- Beschrijving — Meerdere regels tekst
- Outputtypes — Eén regel tekst
- Systeeminstructie — Meerdere regels tekst
- Actief — Ja/Nee
- Volgorde — Getal

Kopieer de tien records uit `data/templates.json` naar deze List. De velden `id`, `title`, `description`, `outputs`, `prompt` en `active` corresponderen met de List-kolommen.

### AI Gebruik

Maak:

- Title — Eén regel tekst
- Account — Eén regel tekst
- Sjabloon — Eén regel tekst
- InputTokens — Getal
- OutputTokens — Getal
- TotaalTokens — Getal
- Datum — Datum en tijd

## 3. Entra ID

Gebruik bij voorkeur één appregistratie voor deze eerste architectuur. De browser krijgt een token voor de eigen API. De Node-backend gebruikt daarna On-Behalf-Of om namens de gebruiker Microsoft Graph aan te spreken.

Configureer:

- een SPA redirect URI voor het definitieve domein;
- een delegated scope `api://<client-id>/access_as_user`;
- Microsoft Graph delegated permissions die de gekozen SharePoint Lists kunnen lezen en wijzigen;
- admin consent voor de vereiste permissions;
- een client secret voor de serverzijde.

Voor een productieomgeving moet de Graph-toegang zo beperkt mogelijk worden ingericht. Microsoft Graph documenteert `Sites.Read.All` als least-privileged permission voor het lezen van List-items; voor wijzigingen is een schrijfmachtiging nodig. Ondersteuning voor geselecteerde Lists kan verder worden verfijnd afhankelijk van de gekozen permissiestrategie.

## 4. Servervariabelen

Vul op de hostingomgeving minstens in:

```text
M365_TENANT_ID
M365_CLIENT_ID
M365_CLIENT_SECRET
M365_API_AUDIENCE
M365_API_SCOPE
OPENAI_API_KEY
OPENAI_MODEL
aSHAREPOINT_SITE_ID
USERS_LIST_ID
TEMPLATES_LIST_ID
USAGE_LIST_ID
```

Let op: `aSHAREPOINT_SITE_ID` is een typefoutgevoelige regel; de juiste variabele is **`SHAREPOINT_SITE_ID`**.

De bestaande GitHub Secrets `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` en `OPENAI_API_KEY` worden door de backend als aliases ondersteund voor tenant/client/secret. De SharePoint/List-waarden moeten nog als server environment variables worden toegevoegd.

## 5. Testvolgorde

1. Meld aan met het beheeraccount.
2. Controleer of de beheerpagina zichtbaar is.
3. Controleer of de drie Lists correct worden uitgelezen.
4. Voeg één testleerkracht toe.
5. Meld aan als die leerkracht.
6. Genereer eerst tekst.
7. Controleer daarna PDF-output.
8. Controleer in `AI Gebruik` of het tokenverbruik is gelogd.
9. Controleer dat de OpenAI API-key nergens in de browserbroncode voorkomt.
