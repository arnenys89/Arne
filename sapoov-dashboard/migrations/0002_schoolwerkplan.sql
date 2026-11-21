-- Voeg Schoolwerkplan toe aan de centrale SAPOOV-applicatiecatalogus.
-- Toegang blijft centraal toewijsbaar via user_app_roles.
INSERT OR IGNORE INTO applications(id,name,description,url,icon,category,sort_order)
VALUES ('schoolwerkplan','Schoolwerkplan','Interactieve beleidsomgeving van Richtpunt campus Ninove–Zottegem','https://schoolwerkplan-poov.pages.dev','book-open','Onderwijs',55);
