# SAPOOV multi-tenant — bevestigde ontwerpbeslissingen

Datum: 27 november 2026
Status: organisatorische beslissingen vastgelegd; technische implementatie nog niet gestart.
Branch: feature/sapoov-multi-tenant-foundation

## 1. Organisatiestructuur
SAPOOV moet meerdere koepels ondersteunen, met meerdere schoolbesturen per koepel, meerdere onderwijsinstellingen per bestuur en meerdere locaties per instelling. De hiërarchie is koepel → schoolbestuur → onderwijsinstelling/school → locatie.

De huidige bevestigde bovenliggende structuur is:
- **Koepel:** Provinciaal Onderwijs Vlaanderen.
- **Schoolbestuur:** Provinciebestuur Oost-Vlaanderen.

De organisatiestructuur moet later bijkomende koepels en schoolbesturen kunnen bevatten. De huidige namen mogen dus niet als vaste waarden in de applicatiecode worden ingebakken.

## 2. Bevestigde instellingen en locaties

### Secundair onderwijs
- **Richtpunt campus Ninove Zottegem:** één schoolcontext met twee locaties: locatie Ninove en locatie Zottegem.
- **Richtpunt campus Eeklo:** afzonderlijke schoolcontext; locatie(s) nog te specificeren.
- **Richtpunt campus Hamme:** afzonderlijke schoolcontext; locatie(s) nog te specificeren.
- **Richtpunt campus Gent Henleykaai:** instelling/locatiebenaming volgens de officiële schrijfwijze Henleykaai.
- **Richtpunt campus Gent-Oudenaarde:** afzonderlijke instelling; de Gentse locatie is Gent – Godshuizenlaan.

### Basisonderwijs
- **Kiempunt campus Assenede:** afzonderlijke basisschool; locatie(s) nog te specificeren.
- **Kiempunt campus Eeklo:** afzonderlijke basisschool; locatie(s) nog te specificeren.

De schrijfwijze van “Kimpunt” en de volledige officiële instellingsnaam voor Assenede moeten nog worden bevestigd.

### Volwassenenonderwijs
- **Groeipunt:** instelling voor volwassenenonderwijs binnen hetzelfde schoolbestuur.
- De eventuele locaties van Groeipunt zijn nog niet gespecificeerd.

Voorlopig zijn er dus acht onderwijsinstellingen/contexten onder Provinciebestuur Oost-Vlaanderen: vijf secundaire scholen, twee basisscholen en één instelling voor volwassenenonderwijs. De formele juridische/administratieve namen en resterende identificatiecodes worden per veld geverifieerd; zie het bronregister.

**Terminologie:** de school/onderwijsinstelling is de organisatorische entiteit. Een locatie is een fysieke vestigingsplaats van die instelling. Gebruik in de SAPOOV-interface en documentatie de term **locatie**, niet **campus**, voor fysieke vestigingsplaatsen. Het woord “campus” blijft wel deel van een officiële schoolnaam waar dat zo is vastgelegd.

## 3. Naamgevingsregel
Wanneer het woord campus voorkomt in een schoolnaam, wordt het altijd met een kleine letter geschreven: **campus**. Deze schrijfwijze geldt consequent in SAPOOV, de beheerinterface, rapporten en documentatie. Voorbeelden zijn “Richtpunt campus Ninove Zottegem”, “Richtpunt campus Eeklo”, “Richtpunt campus Hamme”, “Richtpunt campus Gent Henleykaai”, “Kiempunt campus Assenede” en “Kiempunt campus Eeklo”.

## 4. Organisatiemetadata
Elke koepel, elk schoolbestuur en elke onderwijsinstelling/school krijgt eigen beheerbare metadata. Voorzie minstens de volgende velden op elk van deze organisatieniveaus:

- **Logo:** verwijzing naar het eigen logo-bestand of de beheerde logo-asset. Bewaar het bestand in de daarvoor voorziene opslag; sla in de organisatietabel een stabiele assetverwijzing op.
- **Website:** officiële website-URL.
- **E-mailadres:** algemeen contact- of secretariaatsadres van de entiteit; dit staat los van persoonlijke gebruikersaccounts.
- **Fysiek adres:** officieel correspondentie- of vestigingsadres van de entiteit. De afzonderlijke locaties behouden daarnaast elk hun eigen fysiek adres.
- **Afkorting:** officiële of door het bestuur vastgelegde korte naam.
- **Instellingsnummer:** het officiële administratieve identificatienummer, als dat voor de betreffende entiteit bestaat en van toepassing is.

Deze gegevens horen bij de entiteit zelf en mogen niet worden afgeleid uit de naam of gedeeld worden met een bovenliggende of onderliggende entiteit. Een school kan dus een eigen logo, website, afkorting en instellingsnummer hebben, los van die van het schoolbestuur en de koepel. De velden moeten afzonderlijk wijzigbaar zijn via de beheerinterface.

Gebruik UUID's als interne primaire sleutels. Het instellingsnummer is een extern/administratief kenmerk en mag niet als interne primaire sleutel of enige technische koppelsleutel dienen. Maak het veld configureerbaar en eventueel leeg zolang het officiële nummer niet bevestigd is; dwing geen uniek nummer af over verschillende organisatietypes heen zonder de toepasselijke administratieve regels te kennen. Valideer de uniciteit binnen het relevante type en register zodra die regels bevestigd zijn.

## 5. Functionele en organisatorische modellering
Het datamodel mag niet veronderstellen dat elke instelling een secundaire school is. Voorzie daarom een configureerbaar instellingstype of onderwijsniveau, minstens:
- secundair onderwijs;
- basisonderwijs;
- volwassenenonderwijs.

Gebruik een generiek organisatietype voor de onderliggende onderwijsinstelling, zodat ook andere onderwijsvormen later kunnen worden toegevoegd. Locaties zijn afzonderlijke entiteiten onder een instelling; een instelling kan één of meerdere locaties hebben of voorlopig zonder opgesomde locaties geregistreerd worden.

## 6. Bevestigde functionele keuzes
1. De aankopenmodule wordt beheerd op school-/instellingsniveau.
2. Eén gedeelde codebasis voor alle schoolcontexten.
3. Afzonderlijke D1-database en R2-bucket per schoolcontext.
4. Centrale identiteit en autorisatie via de bestaande SAPOOV-identiteitslaag.
5. Rechten op koepel- en schoolbestuurniveau werken uitsluitend door na expliciete toekenning. Overerving staat standaard uit.
6. Een gebruiker met toegang tot meerdere contexten kiest na aanmelden zelf de actieve context.
7. Modules kunnen configureerbaar zijn op koepel-, schoolbestuur-, instelling- of locatieniveau.
8. Autorisatie wordt server-side afgedwongen. Een door de client aangeleverde organisatie-ID verleent nooit op zichzelf toegang.

## 7. Technische inrichting
- Organisatietabellen: umbrella_organizations, school_boards, educational_institutions (of schools als generieke tabel), en locations.
- Voor koepels, schoolbesturen en onderwijsinstellingen zijn velden voorzien voor logo_asset_id (of gelijkwaardige assetverwijzing), website_url, abbreviation en institution_number.
- Onderwijsniveau/instellingstype is configureerbare data, geen hardgecodeerde lijst in applicatielogica.
- UUID's als stabiele sleutels; namen en administratieve instellingsnummers zijn geen interne identifiers.
- Centrale gebruikersidentiteit met organisatiegebonden lidmaatschappen en rollen.
- Moduleconfiguraties krijgen een expliciet organisatietype en organisatie-ID.
- De API resolveert na autorisatie zelf de D1- en R2-resource.
- Nieuwe schoolcontexten starten met lege databases uit dezelfde versiebeheerbare schema-migraties; bestaande bestellingen of persoonsgegevens worden niet gekopieerd.
- Rechtenwijzigingen, contextwissels en gevoelige mutaties worden auditbaar geregistreerd.

## 8. Migratievolgorde
1. Officiële namen, onderwijsniveaus, locatienamen, metadata en identificatiecodes bevestigen.
2. Centraal organisatieschema en lidmaatschappen implementeren.
3. Module- en rollenmatrix met expliciete scopes implementeren.
4. Contextkeuze na aanmelden bouwen.
5. API-autorisatie en beveiligingstests uitvoeren.
6. Bestaande school Richtpunt campus Ninove Zottegem met locaties Ninove en Zottegem gecontroleerd migreren.
7. Afzonderlijke contexten Eeklo, Hamme, Gent, de twee basisscholen en Groeipunt configureren met eigen opslag volgens de gekozen isolatiestrategie.
8. Gegevensisolatie, rechten en bestaande werking valideren.

## 9. Bronregister en resterende verificatie
- Formele juridische/administratieve namen en officiële instellingsnummers van koepel, schoolbestuur en alle onderwijsinstellingen.
- Officiële afkortingen, website-URL's, contact-e-mailadressen en correspondentieadressen per entiteit.
- De juiste logo's en de goedgekeurde logo-bestanden per entiteit.
- Officiële schrijfwijze van “Kimpunt” en de volledige namen van de basisscholen Assenede en Eeklo.
- Officiële locatienamen en locatiecodes.
- De overige locaties van Richtpunt campus Gent-Oudenaarde en de locatiestructuur van Groeipunt.
- Mapping van bestaande gebruikersrollen naar Richtpunt campus Ninove Zottegem.

Het gecontroleerde bronregister met websites, e-mailadressen, adressen, beschikbare instellingsnummers, logo-bronnen, verificatiestatussen en bronlinks staat in [SAPOOV — officieel organisatie- en contactregister](sapoov-official-organization-registry-2026-11-27.md).\n\n## 10. Veiligheidsgrens
Dit document legt de ontwerpbeslissingen vast. Er zijn geen productiedatabases, records, Workers, Pages-projecten, DNS-records, Access-policies of R2-objecten aangepast.
