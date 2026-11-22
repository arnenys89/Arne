# Examenmaker binnen SAPOOV

De Examenmaker is geïntegreerd in de centrale SAPOOV-dashboard Worker.

- Publieke route: `/examenmaker`
- Worker: `richtpunt-dashboard`
- Broncode: `platforms/sapoov-dashboard/worker.js`
- De oorspronkelijke Examenmaker Worker-bron is bewaard in `platforms/examenmaker/legacy-worker.js` als migratie- en rollbackreferentie.
- De bestaande D1-database blijft behouden en is als `DB` aan de centrale Worker gekoppeld.
- De centrale Cloudflare Access-identiteit en SAPOOV-toegangscontrole blijven actief.

## Tijdelijke migratieafhankelijkheid

De Examenmaker gebruikt de bestaande SAPO API-sleutel voor het ophalen en opslaan van leerplangegevens. Cloudflare geeft de waarde van een bestaande Worker-secret niet terug. Daarom worden uitsluitend de `/api/sapo/*`-verzoeken voorlopig doorgestuurd naar de oude Worker. De overige Examenmaker-pagina's, API-routes, databasebewerkingen en Word/PDF-export lopen via de centrale Worker.

De oude Worker mag pas worden verwijderd nadat de SAPO API-secret veilig naar de centrale Worker is overgezet en de leerplanfunctionaliteit end-to-end is getest.
