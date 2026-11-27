# Belgische eID NFC-lezer (Android)

Zelfstandige Flutter-app om de **contactloze ICAO-chip** van een Belgische identiteitskaart te lezen met NFC en de CAN-code.

## Functies
- CAN-code handmatig invoeren (6 cijfers).
- NFC-chip lezen met PACE/BAC via `eid_nfc` en `eid_icao`.
- MRZ-gegevens en de pasfoto tonen.
- Gegevens lokaal exporteren als JSON of PDF via het Android-deelmenu.
- Gelezen gegevens uit het scherm wissen.
- Geen backend, account of cloudopslag.

## Belangrijke beperking
Deze app leest de **contactloze NFC-chip** van geschikte Belgische eID-kaarten (EU-identiteitskaarten met ICAO-chip, doorgaans uitgegeven sinds augustus 2021). Dit is niet hetzelfde als de klassieke contactchip die met een USB-kaartlezer wordt gelezen.

De app vraagt standaard geen optionele nationale identificatienummers op. De CAN-code wordt alleen gebruikt om de chip te openen en wordt niet bewaard of geëxporteerd.

De ICAO-bibliotheek controleert de integriteit van de gelezen gegevens en kan de chip-authenticiteit controleren. De officiële certificaten van de uitgevende landen (CSCA trust anchors) zijn niet in deze eerste versie ingebouwd. Zonder die trust anchors kan de certificaatketen dus niet als vertrouwd worden bevestigd. Een geslaagde NFC-uitlezing is op zichzelf geen juridisch bewijs van identiteit of echtheid.

Vingerafdrukken en irisscans worden niet gelezen.

## Camerascan zonder CAN-code
- Fotografeer de voor- en achterkant met de ingebouwde camera.
- Herkent tekst lokaal met Google ML Kit (Latin OCR), zonder serverupload.
- Probeert naam, voornamen, geboortedatum, geslacht, nationaliteit, kaartnummer en vervaldatum uit de MRZ te halen.
- Exporteert herkende velden en tekst naar JSON of PDF op uitdrukkelijk verzoek.
- OCR kan fouten maken; de scan leest de NFC-chip niet en bewijst de echtheid niet.

## APK bouwen
De GitHub Actions-workflow `.github/workflows/build-eid-apk.yml` bouwt de release-APK automatisch bij een wijziging in deze map. De APK wordt als workflow-artifact gepubliceerd.

Lokaal bouwen vereist Flutter stable, Android SDK en Java 17:
```bash
cd belgische-eid-android
flutter create --platforms=android --org be.sapoov --project-name belgische_eid .
# Zet minSdk in android/app/build.gradle.kts op 24
flutter pub get
flutter build apk --release
``

## Privacy
Persoonsgegevens en pasfoto worden uitsluitend op het toestel verwerkt. Export gebeurt alleen wanneer de gebruiker zelf op exporteren tikt. Behandel exports als gevoelige persoonsgegevens en verwijder ze na gebruik.
