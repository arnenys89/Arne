# Agenda Sync

Synchroniseert Google Calendar en Microsoft 365 in twee richtingen en leest daarnaast een externe ICS-agenda in.

De ICS-bron is standaard read-only. Google en Microsoft 365 zijn schrijfbaar. De synchronisatie gebruikt een lokale statefile om duplicaten en synchronisatielussen te vermijden.

Zie `.env.example` voor configuratie en de OAuth-routes `/api/calendar/google` en `/api/calendar/microsoft` om beide accounts te koppelen.
