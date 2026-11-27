# SAPOOV – organisaties- en locatiesregister

Laatste broncontrole: 27 november 2026  
Werkbranch: `feature/sapoov-organization-registry`  
Status: brongegevens verzameld; importbestand voorbereid; nog niet naar D1 geïmporteerd en niet naar productie uitgerold.

## 1. Vastgelegde organisatorische structuur

- Koepel: **Provinciaal Onderwijs Vlaanderen** (POV).
- Schoolbestuur: **Provincie Oost-Vlaanderen**; SAPOOV-weergavenaam: **Provinciebestuur Oost-Vlaanderen**.
- Onder dit bestuur worden acht onderwijsinstellingen opgenomen: vijf Richtpunt-instellingen, twee Kiempunt-instellingen en CVO Groeipunt.
- **Kiempunt Buggenhout wordt volledig uitgesloten**: geen organisatie, geen locatie en geen importrecord.
- Ninove en Zottegem zijn twee fysieke locaties van één onderwijsinstelling: **Richtpunt campus Ninove-Zottegem**.
- Gent Henleykaai en Gent Godshuizenlaan zijn twee afzonderlijke onderwijsinstellingen in SAPOOV.
- De door de gebruiker vastgelegde SAPOOV-naam **Richtpunt campus Gent Godshuizenlaan** heeft precies één SAPOOV-locatie: Gent – Godshuizenlaan. De locaties Oudenaarde en Gent Abdisstraat worden niet opgenomen in die instelling.

## 2. Koepel en schoolbestuur

| Niveau | SAPOOV-naam | Afkorting | Website | E-mail | Telefoon | Adres |
|---|---|---|---|---|---|---|
| Koepel | Provinciaal Onderwijs Vlaanderen | POV | https://pov.be | provinciaalonderwijsvlaanderen@pov.be | +32 486 79 00 01 | Groendreef 1, 1000 Brussel, België |
| Schoolbestuur | Provinciebestuur Oost-Vlaanderen | — | https://oost-vlaanderen.be | provinciaalonderwijs@oost-vlaanderen.be | +32 9 267 74 45 | Charles de Kerchovelaan 189, 9000 Gent, België |

De juridische/administratieve entiteit is Provincie Oost-Vlaanderen. De benaming “Provinciebestuur Oost-Vlaanderen” is de gekozen SAPOOV-weergavenaam. Het contactadres van Directie Onderwijs wordt gebruikt als functioneel contactpunt voor het schoolbestuur; het is niet het persoonlijke adres van een gebruiker.

Bronnen:
- POV-contactgegevens: https://pov.be/over-ons-contacteer-ons/
- Provinciale contactlijst en Directie Onderwijs: https://oost-vlaanderen.be/content/ovl/nl/bestuur-en-regio/het-provinciebestuur/contacten-diensten.html

## 3. Acht onderwijsinstellingen

De volgende administratieve nummers zijn gevonden in officiële onderwijsbronnen. De gebruiker heeft expliciet bevestigd dat de contactgegevens correct zijn en dat instellingsnummer 36467 correct is. De andere nummers zijn opgenomen op basis van officiële bronvermeldingen, maar blijven bij import voorzien van bron- en verificatiemetadata.

| SAPOOV-naam | Type | Instellingsnummer | Website | Algemeen e-mailadres | Telefoon | SAPOOV-locaties |
|---|---|---:|---|---|---|---|
| Richtpunt campus Ninove-Zottegem | Secundair | 145722 | https://www.richtpuntninovezottegem.be | info@richtpuntninovezottegem.be | — (contact per locatie) | Ninove; Zottegem |
| Richtpunt campus Eeklo | Secundair | 36467 | https://www.richtpunteeklo.be | info@richtpunteeklo.be | +32 9 370 73 73 | Eeklo |
| Richtpunt campus Hamme | Secundair | 37275 | https://www.richtpunthamme.be | info@richtpunthamme.be | +32 52 47 83 54 | Hamme |
| Richtpunt campus Gent Henleykaai | Secundair | 36624 | https://www.richtpuntgenthenley.be | infocampushenley@richtpuntgent.be | +32 9 267 12 10 | Gent – Henleykaai |
| Richtpunt campus Gent Godshuizenlaan | Secundair | 36699 | https://www.richtpuntgent.be | infocampusgodshuizen@richtpuntgent.be | +32 9 267 12 60 | Gent – Godshuizenlaan |
| Kiempunt campus Assenede | Buitengewoon basisonderwijs | 130237 | https://www.kiempunt.be | info@kiempuntassenede.be | +32 9 344 98 69 | Assenede |
| Kiempunt campus Eeklo | Buitengewoon basisonderwijs | 116079 | https://www.kiempunt.be | info@kiempunteeklo.be | +32 9 377 32 82 | Eeklo |
| CVO Groeipunt | Volwassenenonderwijs | 131888 | https://www.groeipunt.be | info@groeipunt.be | +32 5 431 78 60 | Meerdere locaties en lesplaatsen |

### 3.1 Bronnen per instelling

- Richtpunt campus Ninove-Zottegem, nummer 145722 en schoolfiche: https://data-onderwijs.vlaanderen.be/onderwijsaanbod/adres.aspx?sn=145722. De officiële schoolwebsite bevestigt het algemene e-mailadres en de twee locaties: https://richtpunt.be/ninovezottegem/.
- Richtpunt campus Eeklo, nummer 36467: https://data-onderwijs.vlaanderen.be/onderwijsaanbod/adres.aspx?sn=36467. Inspectieverslag met instellingsnummer, adres, telefoon, e-mail en website: https://app.akov.be/pls/pakov/f?p=INSP_PUBLIEK:VERSLAGEN:::DOWNLOAD::::P1000_DLSEC_BLOB_ID:16414.
- Richtpunt campus Hamme, nummer 37275: https://data-onderwijs.vlaanderen.be/onderwijsaanbod/adres.aspx?sn=37275. Onderwijsinspectie/bronvermelding: https://app.akov.be/pls/pakov/f?p=INSP_PUBLIEK:VERSLAGEN:::DOWNLOAD::::P1000_DLSEC_BLOB_ID:22594.
- Richtpunt campus Gent Henleykaai, nummer 36624: https://data-onderwijs.vlaanderen.be/onderwijsaanbod/adres.aspx?sn=36624. Schoolfiche met adres, telefoon, e-mail en website: https://www.cultuurkuur.be/scholen/gent/richtpunt-campus-gent-henleykaai.
- Richtpunt campus Gent Godshuizenlaan, nummer 36699: https://data-onderwijs.vlaanderen.be/onderwijsaanbod/adres.aspx?sn=36699. Schoolfiche: https://www.cultuurkuur.be/scholen/gent/richtpunt-campus-gent-godshuizenlaan. De Vlaamse POI-bron noemt deze instelling afzonderlijk met hoofdzetel Godshuizenlaan 65, 9000 Gent.
- Kiempunt campus Assenede, nummer 130237: officiële POI-bron en schoolfiche via https://data-onderwijs.vlaanderen.be/onderwijsaanbod/adres.aspx?sn=130237. Provinciale contactlijst: https://oost-vlaanderen.be/content/ovl/nl/bestuur-en-regio/het-provinciebestuur/contacten-diensten.html.
- Kiempunt campus Eeklo, nummer 116079: officiële schoolfiche via https://data-onderwijs.vlaanderen.be/onderwijsaanbod/adres.aspx?sn=116079. Provinciale contactlijst: https://oost-vlaanderen.be/content/ovl/nl/bestuur-en-regio/het-provinciebestuur/contacten-diensten.html.
- CVO Groeipunt, nummer 131888: besluit van de Vlaamse Regering van 10 juli 2026, gepubliceerd in het Belgisch Staatsblad van 13 augustus 2026, vermeldt “131888 - CVO Groeipunt”: https://eur-lex.europa.eu/legal-content/NL/TXT/PDF/?uri=CELEX:72024L1785BEL_202606567. Contact: https://www.oost-vlaanderen.be/content/ovl/nl/bestuur-en-regio/het-provinciebestuur/contacten-diensten.html. Locatieoverzicht: https://www.groeipunt.be/lesplaats/dendermonde.

### 3.2 Opmerking over CVO Groeipunt en oudere nummering

In oudere bronnen komt ook nummer **131482** voor bij CVO Groeipunt. De meest recente gevonden Vlaamse regelgeving van 10 juli 2026 vermeldt **131888 - CVO Groeipunt**. Daarom wordt 131888 als actuele kandidaat voor de centrale instelling gebruikt. Nummer 131482 wordt als historische/te verifiëren bronvermelding bewaard en niet als tweede Groeipunt-organisatie geïmporteerd. Voor een definitieve administratieve koppeling blijft de live Instellingen-API van Onderwijs & Vorming leidend.

## 4. Locaties

### 4.1 Richtpunt campus Ninove-Zottegem

| Locatie | Adres | Telefoon | E-mail |
|---|---|---|---|
| Ninove | Centrumlaan 160, 9400 Ninove, België | +32 54 31 78 50 | info@richtpuntninove.be |
| Zottegem | Sabina van Beierenlaan 35, 9620 Zottegem, België | +32 9 360 19 93 | info@richtpuntzottegem.be |

De officiële schoolwebsite vermeldt daarnaast het algemene adres info@richtpuntninovezottegem.be.

### 4.2 Overige Richtpunt- en Kiempunt-locaties

| Instelling | Locatie | Adres | Telefoon | E-mail |
|---|---|---|---|---|
| Richtpunt campus Eeklo | Eeklo | Roze 131, 9900 Eeklo, België | +32 9 370 73 73 | info@richtpunteeklo.be |
| Richtpunt campus Hamme | Hamme | Meulenbroekstraat 15, 9220 Hamme, België | +32 52 47 83 54 | info@richtpunthamme.be |
| Richtpunt campus Gent Henleykaai | Gent – Henleykaai | Henleykaai 83, 9000 Gent, België | +32 9 267 12 10 | infocampushenley@richtpuntgent.be |
| Richtpunt campus Gent Godshuizenlaan | Gent – Godshuizenlaan | Godshuizenlaan 65-75, 9000 Gent, België | +32 9 267 12 60 | infocampusgodshuizen@richtpuntgent.be |
| Kiempunt campus Assenede | Assenede | Stoepestraat 40, 9960 Assenede, België | +32 9 344 98 69 | info@kiempuntassenede.be |
| Kiempunt campus Eeklo | Eeklo | Gentsesteenweg 82-84, 9900 Eeklo, België | +32 9 377 32 82 | info@kiempunteeklo.be |

**Belangrijke afwijking tussen officiële bron en SAPOOV-indeling:** de actuele provinciale contactpagina groepeert Gent Godshuizenlaan nog onder “Richtpunt campus Gent-Oudenaarde” en vermeldt daarnaast Gent Abdisstraat en Oudenaarde. De gebruiker heeft voor SAPOOV expliciet beslist dat de instelling **Richtpunt campus Gent Godshuizenlaan** heet en nog slechts één locatie heeft: Gent – Godshuizenlaan. De import volgt die gebruikersbeslissing. De officiële brongegevens worden wel bewaard als herkomstnotitie; ze mogen de SAPOOV-indeling niet stilzwijgend terug veranderen.

### 4.3 CVO Groeipunt-locaties

Het centrumreglement 2025-2026 noemt de volgende campussen met secretariaat. In SAPOOV worden dit fysieke locaties onder één CVO Groeipunt-instelling:

| Locatie | Adres |
|---|---|
| Gent Leopoldskazerne (hoofdzetel) | Charles de Kerchovelaan 189, 9000 Gent, België |
| Gent Henleykaai | Henleykaai 83, 9000 Gent, België |
| Gent Gouvernementstraat | Gouvernementstraat 22-24, 9000 Gent, België |
| Gent Sint-Amandsberg | E. Tinelstraat 92, 9040 Sint-Amandsberg, België |
| Eeklo | Roze 131, 9900 Eeklo, België |
| Deinze | Brielstraat 25, 9800 Deinze, België |
| Ninove | Centrumlaan 160, 9400 Ninove, België |
| Lokeren | Durmelaan 34A, 9160 Lokeren, België |
| Wetteren | Nieuwstraat 11, 9230 Wetteren, België |
| Zele Koevliet | Koevliet 2C, 9240 Zele, België |
| Zottegem | Sabina van Beierenlaan 35, 9620 Zottegem, België |

Daarnaast vermeldt Groeipunt lesplaatsen zonder vast secretariaat. Die worden pas als afzonderlijke SAPOOV-locaties toegevoegd wanneer ze functioneel nodig zijn; het is niet wenselijk elke tijdelijke of externe lesplaats automatisch als volwaardige schoollocatie te registreren.

Bron voor de elf campussen: Centrumreglement CVO Groeipunt 2025-2026, https://www.groeipunt.be/202505_Centrumreglement%20Groeipunten%20SJ%202025-2026.pdf. Actuele lesplaatsen: https://www.groeipunt.be/lesplaats/dendermonde.

## 5. Logo's en beeldmerken

Officiële merkbronnen:
- POV: https://pov.be
- Provincie Oost-Vlaanderen: https://oost-vlaanderen.be
- Richtpunt: https://www.richtpunt.be en de individuele Richtpunt-websites
- Kiempunt: https://www.kiempunt.be
- Groeipunt: https://www.groeipunt.be

De officiële bronwebsites zijn geïdentificeerd. De logo-afbeeldingen zijn nog niet als lokale bestanden in R2 geplaatst. Dat blijft een aparte assetstap: originele bestanden ophalen van de officiële website, formaat en transparantie controleren, gebruiksvoorwaarden en bron noteren, en pas daarna naar de beheerde R2-opslag kopiëren. Een favicon of zoekmachine-thumbnail geldt niet als goedgekeurd logo.

## 6. Gegevensmodel en importregels

1. Gebruik één centrale organisatiestructuur: koepel → schoolbestuur → onderwijsinstelling → locatie.
2. Gebruik interne UUID's als primaire sleutels. Instellingsnummers blijven externe administratieve kenmerken en worden als tekst opgeslagen.
3. Maak het organisatietype expliciet: `umbrella`, `school_board` of `institution`.
4. Fysieke vestigingen worden in de interface **locaties** genoemd; de database mag bestaande compatibiliteitsnamen behouden zolang de API een duidelijke locatie-abstractie aanbiedt.
5. Bewaar per veld bron-URL, bronrecord, controledatum en verificatiestatus.
6. Contactgegevens van een instelling en contactgegevens van haar locaties blijven afzonderlijk.
7. Een onbekend of niet bevestigd veld blijft leeg; er worden geen e-mailadressen, afkortingen, logo's of administratieve nummers afgeleid.
8. Logo's worden niet rechtstreeks van een externe website hotlinked als definitieve asset.
9. Kiempunt Buggenhout wordt nergens als instelling of locatie aangemaakt.
10. De gebruikersbeslissing voor Gent Godshuizenlaan (één locatie) heeft voorrang op het automatisch kopiëren van extra locaties uit de provinciale contactpagina.
11. CVO Groeipunt is één instelling met meerdere locaties; campus/lesplaats is geen afzonderlijke instelling.
12. Geen data wordt naar productie geschreven voordat de migratie op een geïsoleerde ontwikkelomgeving is getest en goedgekeurd.

## 7. Officiële Vlaamse API's

De Vlaamse overheid biedt een live Instellingen-API voor actuele instellinggegevens en hiërarchieën, en een afzonderlijke Instellingslocaties-API voor fysieke vestigingen en lesplaatsen. De API-documentatie vermeldt dat een API-key moet worden aangevraagd. De API's zijn de voorkeursbron voor periodieke validatie en toekomstige synchronisatie.

- Instellingen-API: https://www.vlaanderen.be/datavindplaats/catalogus/onderwijs-vorming-instellingen
- Instellingslocaties-API: https://www.vlaanderen.be/datavindplaats/catalogus/onderwijs-vorming-instellingslocaties
- API-documentatie: https://onderwijs-api-portaal.vlaanderen.be/documentatie/instellingsgegevens

## 8. Huidige technische stand

- De bestaande branch bevat migratie `0005_organizations.sql` met tabellen voor organisaties, campussen, bronregistratie en koppeling van gebruikers aan organisaties.
- De Worker bevat al centrale, superadmin-beveiligde API-eindpunten voor organisaties, campussen en bronregistraties.
- De beheerinterface heeft deze API's nog niet als volwaardige organisatie- en locatieschermen ontsloten.
- De bestaande tabellen en endpoints moeten vóór een echte import worden uitgebreid met expliciete organisatietypes, de koepel-/bestuurslaag, duidelijke locatie-terminologie en de teamtabellen.
- De huidige seedgegevens zijn nog niet in D1 ingevoerd.
- Er is geen productie-deployment of productie-D1-mutatie uitgevoerd.

## 9. Volgende ontwikkelstappen

1. Schema uitbreiden met organisatietype, eigen metadata op koepel/bestuur/school, en een ondubbelzinnige locatie-entiteit.
2. Brondata als herhaalbare seed-import toevoegen, met vaste sleutels en zonder duplicaten.
3. Organisatiebeheerinterface bouwen met boomstructuur en bewerkbare metadata.
4. Teams en teamlidmaatschappen toevoegen, inclusief actieve leden, passieve leden en teamleiders.
5. Rechtenmatrix en moduletoegang uitbreiden volgens het vastgelegde ontwerp.
6. Logo-assets ophalen en controleren, daarna naar R2 kopiëren.
7. Geautomatiseerde tests uitvoeren op hiërarchie, unieke instellingsnummers, locatiekoppelingen, rechten, auditlog en herhaalbare imports.
8. Pas na acceptatie een aparte migratie- en deploymentprocedure naar productie opstellen.


## 10. Implementatiestatus op 27 november 2026

De volgende onderdelen zijn op de ontwikkelbranch toegevoegd:

- `migrations/0006_multi_tenant_core.sql`: expliciete organisatietypes, eigen metadata voor koepel/schoolbestuur/instelling, aparte `organization_locations`, teamtabellen, teamlidmaatschappen en expliciete moduletoegang per organisatiecontext.
- `migrations/0007_seed_organization_registry.sql`: herhaalbare conceptimport voor de koepel, het schoolbestuur, de acht instellingen en de 19 opgegeven locaties.
- `data/organization-registry.seed.json`: leesbare brondata met stabiele sleutels, ouderrelaties, locatiegegevens, officiële bron-URL's en logo-bronpagina's.
- `src/index.js`: beveiligde superadmin-API voor organisatiebeheer, locaties, teams, teamlidmaatschappen en moduletoegang.
- `public/index.html`, `public/app.js` en `public/styles.css`: eerste beheerschermen voor organisatiegegevens en de hiërarchische, inklapbare teammatrix.

De seed bevat 10 organisatieknopen (1 koepel, 1 schoolbestuur en 8 onderwijsinstellingen) en 19 fysieke locaties. De CVO-locaties zijn beperkt tot de elf campussen met secretariaat uit het centrumreglement 2025-2026; externe of tijdelijke lesplaatsen worden niet automatisch aangemaakt.

### Nog niet uitgevoerd

- Geen enkele D1-migratie is toegepast.
- Geen records zijn in de centrale database ingevoerd.
- Geen logo-bestanden zijn naar R2 gekopieerd.
- Geen Cloudflare Pages- of Worker-deployment uitgevoerd.
- Geen DNS-, Access- of productieconfiguratie aangepast.

De nieuwe beheerinterface toont daarom een melding dat migratie 0006 nog moet worden toegepast wanneer de nieuwe tabellen ontbreken. Dat voorkomt dat de bestaande gebruikersbeheerinterface afhankelijk wordt van een nog niet uitgevoerde migratie.

### Technische controle

- De JavaScript-syntax van `public/app.js` is gecontroleerd.
- De Worker-module is gecontroleerd na omzetting van de `export default`-wrapper naar een parseerbare vorm.
- De D1-migraties zijn nog niet op een echte ontwikkel-database uitgevoerd; daarvoor moet eerst een geïsoleerde testdatabase worden gebruikt en moeten de migraties en seed-import volledig worden gevalideerd.


- `migrations/0008_scoped_role_assignments.sql`: afzonderlijke roltoewijzingen per gebruiker, module, rechtenprofiel en school; descendant-toegang staat standaard uit.
- `src/index.js`: API voor organisatiegebonden roltoewijzingen, met aparte moduletoegangsschakelaar.
- De beheerinterface bevat nu ook de eerste hiërarchische rechtenmatrix met inklapbare koepel-, bestuurs-, school- en modulekoppen. De matrix gebruikt één gebruikersrij per persoon en afzonderlijke selectievakjes voor platformtoegang en rechtenprofielen.
- De teammatrix haalt personeelsrijen bij voorkeur uit de bestaande personeelsprofielen; wanneer die lijst leeg is, gebruikt ze de centrale gebruikerslijst.


De officiële logo-downloadpagina van Provincie Oost-Vlaanderen vermeldt expliciet dat toestemming nodig is voor gebruik van het provincielogo. Voor dit logo wordt dus geen bestand in R2 geplaatst vóór toestemming via info@oost-vlaanderen.be. Voor de overige merken worden de officiële bronpagina's gebruikt; ook daar worden pas assets opgeslagen nadat het juiste bestand en de toepasselijke gebruiksvoorwaarden zijn gecontroleerd. Bron: https://oost-vlaanderen.be/bestuur-en-regio/wat-doet-het-provinciebestuur/logo.html.


### 10.1 Rechtenmatrix, contextkeuze en moduletoegang

- Na aanmelden kan een gebruiker met toegang tot meerdere instellingen zelf de actieve organisatiecontext kiezen.
- Het dashboard toont binnen die context uitsluitend modules waarvoor `user_module_access.enabled = 1`.
- De moduletoegang is een afzonderlijke toegangspoort; een rechtenprofiel alleen maakt de module niet zichtbaar.
- De rechtenmatrix toont per gebruiker, school, module een aparte checkbox voor platformtoegang en daarnaast de afzonderlijke rechtenprofielen.
- Roltoewijzingen worden opgeslagen in `user_scoped_role_assignments` met een expliciete schoolscope. Dezelfde rol kan dus aan dezelfde gebruiker in verschillende scholen afzonderlijk worden toegekend.
- `include_descendants` staat standaard uit. De huidige matrix kent uitsluitend directe schooltoewijzingen toe; automatische overerving is niet actief.
- De actieve context wordt meegestuurd als contextheader naar de centrale API en als `sapoov_context`-parameter naar de modulelink. Elke module moet die context aan de centrale autorisatiecontrole aanbieden; de context-ID op zichzelf verleent geen toegang.
- Zonder actieve moduletoegang weigert de centrale autorisatie-API de modulecontext, ook als er nog een roltoewijzing bestaat.

### 10.2 Veiligheids- en validatiecontroles

- Organisatierelaties worden server-side beperkt tot koepel → schoolbestuur → onderwijsinstelling.
- De API weigert zelfverwijzingen en hiërarchische cycli.
- Locaties en teams kunnen alleen aan een onderwijsinstelling worden gekoppeld.
- Teamlidmaatschappen zijn uniek per team/gebruiker en kennen precies één status: actief lid, passief lid of teamleider.
- De teammatrix gebruikt personeelsprofielen wanneer die bestaan; zonder personeelsprofielen toont ze de centrale gebruikerslijst als terugval.
- De JavaScript-syntax van de frontend en Worker is gecontroleerd; alle door de frontend gebruikte element-ID's bestaan in de HTML.
- De seed is gecontroleerd op 10 organisatieknopen, 8 onderwijsinstellingen, 19 locaties, unieke instellingsnummers, geldige ouderverwijzingen, twee locaties voor Ninove-Zottegem, één locatie voor Gent Godshuizenlaan en uitsluiting van Buggenhout.
- De 69 INSERT-statements in de seedmigratie hebben een gelijk aantal kolommen en waarden.

Deze controles zijn broncode-/structuurcontroles. Ze vervangen geen uitvoering van de migraties tegen een geïsoleerde D1-testdatabase of een volledige browser- en autorisatietest.
