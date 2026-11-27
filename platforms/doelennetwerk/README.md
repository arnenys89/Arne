# SAPO Doelennetwerk — SAPOOV centraal

De SAPO Doelennetwerk-app wordt via SAPOOV aangeboden op `https://www.sapoov.be/doelennetwerk/`.

## Architectuur
- `worker.js`: centrale Worker `sapoov-doelennetwerk`.
- Frontendbron: `sapo-doelennetwerk/index.html`.
- 3D-weergave: overgenomen uit de bestaande Worker-bron.
- Dataset: bestaande Cloudflare KV-namespace `SAPO-DOELENNETWERK-DATA`, sleutel `analysis.json`.
- Identiteit en rollen: centrale SAPOOV Identity API, applicatie-ID `doelennetwerk`.
- Alleen de centrale Administrator-rol kan een nieuwe dataset uploaden; lezers behouden leesrechten.

De KV-dataset wordt rechtstreeks hergebruikt en niet gekopieerd. Daardoor blijven alle bestaande doelen en automatische kandidaatverbindingen behouden.

## Inhoudelijke duiding
De verbanden zijn automatische kandidaatverbindingen en geen pedagogisch gevalideerde relaties. Ze vragen inhoudelijke beoordeling.

## Publicatie
Cloudflare Worker route: `www.sapoov.be/doelennetwerk*`.
