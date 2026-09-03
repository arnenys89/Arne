# OnderwijsAI — deployment met GitHub + Azure Static Web Apps

Deze applicatie gebruikt GitHub voor de frontend en broncode, en Azure Static Web Apps + Azure Functions voor de beveiligde `/api`-laag. Daardoor blijft `ai.richt.be` één website en bestaan frontend en API onder hetzelfde domein.

## Architectuur

- GitHub repository `arnenys89/Arne`: broncode en CI/CD
- `public/`: statische frontend
- `api/`: Azure Functions v4 API
- Azure Static Web Apps: hosting van frontend + serverless API
- Microsoft Entra ID: Microsoft-login via `common`
- Microsoft Graph: server-side toegang tot schoolse SharePoint Lists
- OpenAI: uitsluitend server-side via `OPENAI_API_KEY`

Azure Static Web Apps stelt managed Azure Functions beschikbaar via `/api`; de API-map wordt in de GitHub Actions-workflow met `api_location` aangewezen. citeturn269696search2turn269696search9

## 1. Azure Static Web App aanmaken

Maak in de Azure Portal een **Static Web App**.

Kies:

- Deployment source: GitHub
- Repository: `arnenys89/Arne`
- Branch: `master`
- App type: Custom / No framework

De GitHub Actions-workflow in `.github/workflows/azure-static-web-apps.yml` is voorbereid met:

```yaml
app_location: "public"
api_location: "api"
output_location: ""
```

Azure Static Web Apps gebruikt de `api`-route voor Functions API's. citeturn269696search2turn269696search6

## 2. GitHub Secret voor deployment

Voeg in GitHub bij **Settings → Secrets and variables → Actions** het secret toe:

`AZURE_STATIC_WEB_APPS_API_TOKEN`

Gebruik hiervoor het deployment token uit de Azure Static Web App.

## 3. Environment variables in Azure

Open in Azure Static Web Apps:

**Settings → Environment variables**

Voeg voor de production environment minstens deze variabelen toe:

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

Aanbevolen waarde voor `OPENAI_MODEL` is:

```text
gpt-5.6-luna
```

De Azure Static Web Apps application settings zijn als environment variables beschikbaar voor de backend API en worden versleuteld opgeslagen. Configureer productiewaarden in Azure, niet in `local.settings.json`. citeturn269696search0

## 4. Microsoft Entra ID

De frontend en backend gebruiken bewust de Microsoft identity platform `common` authority:

```text
https://login.microsoftonline.com/common
```

De app-registratie moet dus accounts uit meerdere organisaties en persoonlijke Microsoft-accounts ondersteunen.

`M365_API_AUDIENCE` moet overeenkomen met de audience waarvoor het access token wordt uitgegeven, bijvoorbeeld:

```text
api://<CLIENT-ID>
```

`M365_API_SCOPE` moet overeenkomen met de gedeclareerde delegated permission, bijvoorbeeld:

```text
api://<CLIENT-ID>/access_as_user
```

## 5. Microsoft Graph / SharePoint Lists

De login-tenant en de data-tenant zijn bewust van elkaar gescheiden.

`SHAREPOINT_TENANT_ID` identificeert alleen de schoolse SharePoint-omgeving waarin de Lists staan. Deze waarde bepaalt niet wie kan inloggen.

De app gebruikt voor Lists app-only Microsoft Graph-toegang. De Entra-appregistratie heeft daarom passende **Application permissions** voor Microsoft Graph nodig, met admin consent in de schooltenant.

## 6. Custom domain

Nadat de Static Web App werkt op de door Azure toegewezen hostnaam:

1. Open **Custom domains** in de Static Web App.
2. Voeg `ai.richt.be` toe.
3. Volg de door Azure gegeven DNS-records.
4. Verwijder pas daarna de oude GitHub Pages-DNS-koppeling.

Azure Static Web Apps ondersteunt custom domains en voorziet automatisch SSL/TLS-certificaten voor custom domains. citeturn658228search6

## 7. Testvolgorde

Test na deployment eerst:

```text
https://ai.richt.be/api/health
```

Verwacht een JSON-resultaat met onder meer:

```json
{
  "ok": true,
  "accountTypes": "common"
}
```

Daarna:

```text
https://ai.richt.be/api/config
```

Pas als beide werken, test je de Microsoft-login.

## 8. Beveiliging

- `OPENAI_API_KEY` staat nooit in de browser.
- De frontend ontvangt alleen niet-geheime configuratie zoals client ID en delegated scope.
- Access tokens worden server-side cryptografisch gevalideerd.
- Het SharePoint-token voor app-only Graph blijft server-side.
- Tokenbudgetten en gebruikersrechten worden server-side gecontroleerd.

## 9. Opmerking over de oude Node/Express-server

`server.js` blijft in de repository als referentie en voor een klassieke Node-deployment. De productievariant voor `ai.richt.be` gebruikt nu de serverless API onder `api/`.
