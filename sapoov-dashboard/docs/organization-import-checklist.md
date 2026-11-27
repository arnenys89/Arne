# SAPOOV – importchecklist organisaties en campussen

Dit document is de invul- en controlelijst vóór de eerste gegevensimport. De CSV-sjablonen in dezelfde map zijn bedoeld voor gecontroleerde import; lege velden blijven leeg tot ze uit een betrouwbare bron bevestigd zijn.

## 1. Velden per onderwijsinstelling

| Veld | Verplicht? | Betekenis / controle |
|---|---|---|
| `id` | Ja, technisch | Stabiele interne UUID; bij import genereren als die ontbreekt. |
| `slug` | Ja | Unieke technische sleutel, kleine letters en koppeltekens. |
| `official_name` | Ja | Officiële juridische/administratieve naam uit de onderwijsdatabank. |
| `display_name` | Ja | Naam die SAPOOV toont; volgt de door de gebruiker bevestigde schrijfwijze. |
| `institution_number` | Indien van toepassing | Officieel instellingsnummer, als tekst bewaren. Uniek; nooit afleiden van campusnummer. |
| `enterprise_number` | Indien van toepassing | Ondernemingsnummer, alleen invullen na verificatie. |
| `education_type` | Aanbevolen | Onderwijstype (bv. secundair onderwijs of volwassenenonderwijs), officiële classificatie. |
| `education_network` | Ja | Inrichtende macht/netwerk; standaard Provinciaal Onderwijs Oost-Vlaanderen, controleren per instelling. |
| `parent_organization_id` | Indien van toepassing | Verwijzing naar bovenliggende organisatie. |
| `general_email` | Aanbevolen | Algemeen contactadres; de door de gebruiker bevestigde adressen staan in het organisatiesjabloon. |
| `general_phone` | Aanbevolen | Algemeen telefoonnummer; de door de gebruiker bevestigde nummers staan in het organisatiesjabloon. |
| `website_url` | Aanbevolen | Officiële website-URL. |
| `official_source_url` | Ja voor activatie | URL van de officiële bron die de gegevens bevestigt. |
| `source_verified_at` | Ja voor activatie | Datum waarop de bron gecontroleerd werd (ISO 8601). |
| `status` | Ja | Start op `draft`; pas na volledige controle `active`. |
| `sort_order` | Nee | Volgorde in SAPOOV. |
| logo-velden | Nee | Bron-URL, alternatieve tekst, gebruiksrecht/licentienotitie en later R2-object key. Niet kopiëren zonder rechtencontrole. |

## 2. Velden per campus / vestigingsplaats

Elke campus wordt gekoppeld aan precies één organisatie. Gebruik minimaal:

- interne `id`, `organization_id` en unieke `slug` binnen de organisatie;
- officiële naam en publieksnaam;
- straat, huisnummer, bus, postcode, gemeente en landcode;
- algemeen e-mailadres, telefoon en website indien van toepassing;
- officiële bron-URL en verificatiedatum;
- aanduiding hoofdvestiging, status en sorteerorde;
- logo-bron en gebruiksrecht, indien een campuslogo wordt gebruikt.

Een campus is een fysieke vestigingsplaats, geen tweede instelling. Maak geen campus aan op basis van een oude webvermelding als de gebruiker de locatie-indeling intussen heeft gecorrigeerd.

## 3. Bronregistratie per gegeven

Voor elk belangrijk gegeven bewaren we:

- entiteit: organisatie of campus;
- veldnaam (bv. `institution_number`, `general_email` of `street`);
- bronnaam en exacte bron-URL;
- bronrecord-ID (indien aanwezig);
- controledatum;
- korte notitie over interpretatie of afwijking.

Gebruik de officiële onderwijsdatabank/POI voor instellingsidentiteit en instellingsnummers. Gebruik officiële school- of provinciewebsites voor actuele contactgegevens en campusadressen. Een door de gebruiker bevestigde waarde is bruikbaar als bevestigde invoer, maar noteer dat als gebruikersbevestiging en verzin geen bronrecord-ID.

## 4. Bevestigde uitgangspunten en voorlopig ingevulde waarden

- Acht registraties: vijf Richtpunt-instellingen, twee Kiempunt-instellingen en CVO Groeipunt.
- Kiempunt Buggenhout volledig uitsluiten.
- Richtpunt campus Gent Godshuizenlaan: één locatie, uitsluitend Gent/Godshuizenlaan; geen locatie Oudenaarde.
- Richtpunt campus Gent Henleykaai blijft een afzonderlijke instelling.
- Richtpunt campus Ninove-Zottegem blijft één instelling met locaties Ninove en Zottegem.
- De contactgegevens uit de eerdere overzichtstabel zijn door de gebruiker als correct bevestigd. De vijf eerder getoonde instellingsnummers zijn eveneens door de gebruiker als correct bevestigd. De bevestiging is als gebruikersbevestiging genoteerd; de koppeling aan de actuele officiële bron wordt nog vastgelegd vóór activatie.

## 5. Importvolgorde en kwaliteitscontroles

1. Vul alle acht instellingen in `organizations-import.csv` aan.
2. Vul alleen bevestigde fysieke locaties in `campuses-import.csv` aan.
3. Voeg bronregels toe in `organization-sources-import.csv`.
4. Controleer unieke instellingsnummers, slugs en organisatie-campusrelaties.
5. Controleer dat Buggenhout nergens voorkomt en Gent Godshuizenlaan geen Oudenaardse locatie heeft.
6. Controleer dat Gent Henleykaai en Gent Godshuizenlaan twee afzonderlijke organisaties blijven.
7. Laat alle records op `draft` staan tot de formele gegevenscontrole afgerond is.
8. Voer pas na review en expliciete goedkeuring de migratie/import uit op de beoogde omgeving.

## 6. Niet automatisch invullen

Geen ontbrekende instellingsnummers, ondernemingsnummers, juridische namen, adressen, telefoonnummers, e-mailadressen of logo-licenties afleiden. Onbekende waarden blijven leeg en krijgen de status te verifiëren.
