# OnderwijsAI — deployment met GitHub + Azure Static Web Apps

Deze applicatie gebruikt GitHub voor de frontend en broncode, en Azure Static Web Apps + Azure Functions voor de beveiligde `/api`-laag. Daardoor blijft `ai.richt.be` één website en bestaan frontend en API onder hetzelfde domein.

## Architectuur

- GitHub repository `arnenys89/Arne`: broncode en CI/CD
- `public/`: statische frontend
- `api/`: Azure Functions v4 API
- Azure Static Web Apps: hosting van frontend + serverless API
- Microsoft Entra ID: Microsoft-login via `common`
- Microsoft Graph: server-side toegang tot SharePoint Lists
- OpenAI: uitsluitend server-side via `OPENAI_API_KEY`

## 1. Azure Static Web App aanmaken

Maak in de Azure Portal een **Static Web App**.

Kies:

- Deployment source: GitHub
- Repository: `arnenys89/Arne`
- Branch: `master`
- App type: Custom / No framework

De GitHub Actions-workflow gebruikt:

```yaml
app_location: "public"
api_location: "api"
output_location: ""
```

## 2. GitHub Secret voor deployment

Voeg in GitHub bij **Settings → Secrets and variables → Actions** het secret toe:

`AZURE_STATIC_WEB_APPS_API_TOKEN`

Gebruik hiervoor het deployment token uit de Azure Static Web App.

## 3. Environment variables in Azure

Open in Azure Static Web Apps:

**Settings → Environment variables**

Configureer minstens:

```text
M365_CLIENT_ID
M365_API_AUDIENCE
M365_API_SCOPE
AZURE_CLIENT_SECRET
SHAREPOINT_SITE_ID
USERS_LIST_ID
TEMPLATES_LIST_ID
USAGE_LIST_ID
OPENAI_API_KEY
OPENAI_MODEL
ALLOW_JSON_FALLBACK
```

Gebruik voor productie:

```text
ALLOW_JSON_FALLBACK=false
```

De secrets en app settings horen alleen server-side in Azure te staan.

## 4. Microsoft-login en automatische tenantkeuze

De frontend en backend gebruiken:

```text
https://login.microsoftonline.com/common
```

De app-registratie moet dus accounts uit meerdere organisaties en persoonlijke Microsoft-accounts ondersteunen.

`M365_CLIENT_ID` is de **vaste Client ID van OnderwijsAI**. Die verandert niet per gebruiker of per school.

De backend leest na een succesvolle Microsoft-aanmelding de `tid`-claim uit het access token. Voor een werk- of schoolaccount is dit de Microsoft Entra-tenant van de gebruiker. Die tenant wordt automatisch gebruikt voor de server-side Microsoft Graph-authenticatie.

Daarom is `SHAREPOINT_TENANT_ID` niet meer nodig en mag die variabele niet meer worden ingesteld.

Conceptueel:

```text
Gebruiker meldt aan
        ↓
access token
        ↓
 tid = tenant van gebruiker
        ↓
Microsoft Graph app-only token voor die tenant
        ↓
SharePoint Lists
```

De Graph app-registratie moet wel als service principal aanwezig zijn in de betreffende tenant en daar de vereiste Application permissions + admin consent hebben. Zonder die toestemming kan de API wel authenticeren, maar niet de SharePoint Lists van die tenant lezen.

## 5. Persoonlijke Microsoft-accounts

Een persoonlijk Microsoft-account kan via `common` aanmelden, maar heeft geen school-tenant waarin de school-Lists staan. Daarom wordt een consumentaccount wel als geldige Microsoft-aanmelding herkend, maar krijgt het zonder gekoppelde schoolomgeving geen toegang tot OnderwijsAI-data.

## 6. SharePoint Lists

Maak in de SharePoint-omgeving de Lists:

- `AI Gebruikers`
- `AI Sjablonen`
- `AI Gebruik`

De standaard configuratie gebruikt `SHAREPOINT_SITE_ID` en de drie List-namen of List-ID's. Bij meerdere tenants kunnen de tenant-specifieke site/list-ID's later worden uitgebreid naar een tenantconfiguratie, terwijl de tenant zelf steeds automatisch uit de login komt.

## 7. Custom domain

Nadat de Static Web App werkt op de door Azure toegewezen hostnaam:

1. Open **Custom domains** in de Static Web App.
2. Voeg `ai.richt.be` toe.
3. Volg de door Azure gegeven DNS-records.
4. Verwijder daarna de oude GitHub Pages-koppeling.

## 8. Testvolgorde

Test na deployment eerst:

```text
https://ai.richt.be/api/health
```

De response bevat onder meer:

```json
{
  "ok": true,
  "accountTypes": "common",
  "tenantResolution": "from-signin-tid"
}
```

Daarna:

```text
https://ai.richt.be/api/config
```

Pas als beide werken, test je de Microsoft-login.

Na login moet `/api/me` de tenant van de aangemelde gebruiker tonen en de juiste SharePoint-omgeving aanspreken.

## 9. Beveiliging

- `OPENAI_API_KEY` staat nooit in de browser.
- `AZURE_CLIENT_SECRET` staat nooit in de browser.
- Access tokens worden server-side cryptografisch gevalideerd.
- De Graph-applicatietoken wordt server-side per tenant gecachet.
- Tokenbudgetten en gebruikersrechten worden server-side gecontroleerd.
- In productie staat `ALLOW_JSON_FALLBACK=false`, zodat een SharePoint-fout niet stilzwijgend overschakelt naar lokale JSON-data.

## 10. Belangrijke beperking

De tenant wordt automatisch bepaald, maar de app kan niet magisch een SharePoint-site en Lists vinden in een willekeurige tenant. De betreffende tenant moet de OnderwijsAI-app toestaan en de ingestelde `SHAREPOINT_SITE_ID`/Lists moeten daar bestaan. Voor een echte multi-school SaaS is een volgende stap een tenantconfiguratielaag waarin per `tid` een SharePoint-site en Lists worden gekoppeld.
