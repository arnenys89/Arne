# SAPO Doelennetwerk

Interactieve visualisatie van leerplandoelen uit SAPO.

## Projectbestanden
- `index.html`: frontend voor de interactieve netwerkvisualisatie.
- `analysis.json`: vooraf berekende doel- en verbandendataset (nog afzonderlijk te uploaden).
- `worker.js`: Cloudflare Worker/API-proxy (indien van toepassing).
- `wrangler.toml`: Cloudflare-configuratie.

## Dataset
De huidige analyse bevat 14.822 doelen en 30.024 kandidaatverbindingen. De bestaande relaties zijn voorlopig gebaseerd op gedeelde subdoeltitels en identieke doeltitels. Ze zijn indicatief en moeten inhoudelijk door vakteams gevalideerd worden.

## Beveiliging
Neem nooit de SAPO/Classid API-sleutel op in frontendcode of Git. Bewaar die uitsluitend als Cloudflare Worker secret, bijvoorbeeld `SAPO_API_KEY`.

## Status
De projectdocumentatie is toegevoegd. De frontend en dataset moeten nog als afzonderlijke bestanden in deze map worden gepubliceerd.