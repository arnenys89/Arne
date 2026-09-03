# Microsoft Lists instellen voor OnderwijsAI

## Belangrijk: aanmelden is niet tenantgebonden

OnderwijsAI gebruikt de Microsoft `common` authority. Daardoor kan een gebruiker zich aanmelden met:

- een werkaccount van Microsoft 365;
- een schoolaccount;
- een persoonlijk Microsoft-account (Outlook.com, Hotmail, Live enz.).

De app beperkt de **Microsoft-aanmelding dus niet tot één tenant**. Microsoft vereist wel dat de appregistratie in Entra is ingesteld op **Accounts in any organizational directory and personal Microsoft accounts** (`AzureADandPersonalMicrosoftAccount`). De `common` authority is hiervoor de juiste authority.

## 1. SharePoint-site voor de applicatie

Microsoft Lists blijft de centrale databron voor gebruikers, sjablonen en gebruik. Gebruik hiervoor de school-SharePointsite. De tenant die hiervoor wordt ingesteld is uitsluitend de **data-/SharePointtenant**; hij bepaalt niet wie mag inloggen.

Noteer de site-ID als `SHAREPOINT_SITE_ID`.

## 2. Maak de drie Lists

### AI Gebruikers

- Title — Eén regel tekst
- Account — Eén regel tekst
- Rol — Eén regel tekst
- TokenBudget — Getal
- TokensGebruikt — Getal
- Actief — Ja/Nee

Voeg minstens één beheerder toe. De waarde in `Account` moet exact overeenkomen met het Microsoft-account waarmee de beheerder aanmeldt.

### AI Sjablonen

- Title — Eén regel tekst
- TemplateId — Eén regel tekst
- Beschrijving — Meerdere regels tekst
- Outputtypes — Eén regel tekst
- Systeeminstructie — Meerdere regels tekst
- Actief — Ja/Nee
- Volgorde — Getal

De tien bestaande sjablonen staan in `data/templates.json`.

### AI Gebruik

- Title — Eén regel tekst
- Account — Eén regel tekst
- Sjabloon — Eén regel tekst
- InputTokens — Getal
- OutputTokens — Getal
- TotaalTokens — Getal
- Datum — Datum en tijd

## 3. Microsoft Entra-appregistratie

Kies bij **Supported account types**:

**Accounts in any organizational directory and personal Microsoft accounts**

De applicatie gebruikt vervolgens:

`https://login.microsoftonline.com/common`

voor de gebruikersaanmelding.

De backend valideert het token tegen de tenant-ID die in het token wordt meegegeven. Er wordt dus geen vaste schooltenant gebruikt om gebruikers bij de login te blokkeren.

Voor de SharePoint Lists gebruikt de server app-only Microsoft Graph-toegang. Daardoor hoeft een persoonlijk Microsoft-account zelf geen toegang te hebben tot de school-SharePointsite.

## 4. Servervariabelen

```text
M365_CLIENT_ID
M365_API_AUDIENCE
M365_API_SCOPE
AZURE_CLIENT_SECRET
SHAREPOINT_TENANT_ID
SHAREPOINT_SITE_ID
USERS_LIST_ID
TEMPLATES_LIST_ID
USAGE_LIST_ID
OPENAI_API_KEY
OPENAI_MODEL
```

De bestaande GitHub Secrets `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID` en `OPENAI_API_KEY` kunnen als bron voor de serverconfiguratie worden gebruikt. In deze configuratie is `AZURE_TENANT_ID` de SharePoint/data-tenant en wordt die als `SHAREPOINT_TENANT_ID` gebruikt.

## 5. Wat betekent dit praktisch?

Een gebruiker kan dus gewoon op **Aanmelden met Microsoft** klikken en bijvoorbeeld kiezen voor:

- `leerkracht@school.be`;
- `naam@outlook.com`;
- een ander Microsoft-account.

Daarna bepaalt OnderwijsAI zelf of dat account toegang heeft tot de AI-omgeving en welk tokenbudget eraan gekoppeld is.

**Aanmelden** en **toegang tot de AI-diensten** zijn daarmee twee verschillende zaken.
