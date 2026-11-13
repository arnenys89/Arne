# SAPO Doelennetwerk

Interactieve visualisatie van SAPO-leerplandoelen. De website haalt de brongegevens op via een beveiligde Cloudflare Pages Function en toont relaties uit een vooraf door ChatGPT beoordeelde dataset.

## Architectuur

- `public/index.html`: responsive netwerkvisualisatie.
- `public/data/analysis.json`: vooraf beoordeelde relaties. ChatGPT maakt deze dataset; de website berekent zelf geen verbanden.
- `functions/api/[[path]].js`: beveiligde proxy naar de Classid API.
- `wrangler.toml`: alternatieve Wrangler Worker-configuratie.

## SAPO API

- `GET /api/leerplannen/list`
- `GET /api/leerplannen/{leerplanId}`
- `POST /api/leerplannen/selection`

De Classid API-sleutel wordt uitsluitend als Cloudflare secret `SAPO_API_KEY` opgeslagen.

## Deployment

Dit project is gekoppeld aan de GitHub-map `sapo-doelennetwerk`. Cloudflare Pages gebruikt `public` als outputmap en de Functions-map voor de API-proxy.

Stel in Cloudflare Pages bij **Settings → Variables and Secrets → Production** de secret `SAPO_API_KEY` in.

## ChatGPT-analyseworkflow

1. Brondata uit SAPO ophalen.
2. De doelen hier in ChatGPT inhoudelijk analyseren.
3. De gevalideerde relaties opslaan in `public/data/analysis.json`.
4. Committen naar de productiebranch; Cloudflare Pages publiceert de nieuwe dataset.

Relatieschema:

```json
{
  "sourceGoalId": "SAPO-doel-ID-1",
  "targetGoalId": "SAPO-doel-ID-2",
  "score": 0.92,
  "relationType": "gedeelde vaardigheid",
  "reason": "Inhoudelijke motivering van het verband."
}
```
