# SAPOOV Bestelplatform

Deze map bevat de volledige broncode van de voormalige afzonderlijke Bestelplatform-app.

## Opbouw
- `src/main.jsx` en `src/style.css`: React-gebruikersinterface.
- `worker/index.js`: API-Worker, inclusief Cloudflare Access-validatie, D1- en R2-functionaliteit.
- `db/schema.sql`: oorspronkelijke databasestructuur.
- `db/migrations/`: opeenvolgende schemawijzigingen.
- `vite.config.js`: assets worden gebouwd onder `/bestelplatform/`.

## Migratiestatus
De broncode is nu ondergebracht in de centrale SAPOOV-repository. Dit is nog geen bewijs dat de volledige API op de centrale Worker draait. De API is voorlopig als afzonderlijke modulebron behouden. De bestaande D1-database en R2-bucket blijven tijdens de migratie beschikbaar om dataverlies te vermijden.

## Vereiste bindings voor de API
De API verwacht `DB` (D1), `IMAGES` (R2), `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `APP_NAME`, `APP_ORIGIN` en optioneel de KBO- en GitHub-variabelen.
