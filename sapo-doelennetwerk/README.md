# SAPO Doelennetwerk

Interactieve visualisatie van leerplandoelen uit SAPO.

## Bestanden
- `index.html`: interactieve frontend.
- `analysis.json`: vooraf berekende doel- en verbandendataset (nog niet in deze repository geplaatst).

## Dataset
De analyse bevat 14.822 doelen en 30.024 kandidaatverbindingen. De relaties zijn gebaseerd op gedeelde subdoeltitels en identieke doeltitels. Het zijn automatische suggesties, geen gevalideerde pedagogische verbanden.

## Lokaal testen
Plaats `index.html` en `analysis.json` in dezelfde map en serveer die map via een webserver. De frontend haalt de dataset op via `./analysis.json`.

## Beveiliging
Neem nooit de SAPO/Classid API-sleutel op in frontendcode of Git. Bewaar die uitsluitend als Cloudflare Worker secret.

## Publicatiestatus
De frontend staat in GitHub. De dataset moet nog worden opgeladen en de Cloudflare-hosting moet daarna op deze bestanden worden aangesloten.