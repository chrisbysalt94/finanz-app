# Finanz App - Haushaltsbudget-Planer

Ein Home Assistant Add-on zur gehaltsabhaengigen Budgetplanung fuer Paare. Teilt alle Kosten fair nach Einkommen auf und zeigt auf einen Blick, was jeder ueberweisen muss.

## Features

- **Gehaltsabhaengige Aufteilung** - Kosten werden automatisch proportional zum Einkommen verteilt
- **Eigene Prozent-Aufteilung** - Fuer Posten mit individueller Verteilung (z.B. Handy: 100% eine Person)
- **Prozent- oder Festbetraege** - Budget-Posten als fester Euro-Betrag oder als Prozent vom Gesamteinkommen
- **Investitionen & Sparen** - Individuelle Betraege pro Person (TradeRepublic, Revolut Sparkonto)
- **Automatische Ueberweisungsberechnung** - Zeigt exakt, was jeder wohin ueberweisen muss (inkl. IBAN)
- **Revolut Dauerauftraege** - Berechnet automatisch Pocket-Betraege fuer Revolut
- **Live Spassgeld-Vorschau** - Zeigt in Echtzeit, wie Aenderungen das verfuegbare Geld beeinflussen
- **Dashboard** - Charts, Sparquote, 50/30/20-Regel, Insights
- **Zweitjob-Unterstuetzung** - Optionales zweites Einkommen pro Person
- **PWA** - Funktioniert auch offline als installierbare Web-App

## Screenshots

Die App besteht aus 4 Tabs:
1. **Budget** - Dashboard mit Uebersicht, Charts und Details
2. **Ueberweisungen** - Was jeder wohin ueberweisen muss
3. **Dauerauftraege** - Revolut Pocket-Betraege
4. **Einstellungen** - Einkommen, Investitionen, Sparen und alle Budget-Posten bearbeiten

## Installation

Siehe [INSTALL.md](INSTALL.md) fuer die Schritt-fuer-Schritt Anleitung.

### Kurzversion

1. Home Assistant Add-on Repository hinzufuegen: `https://github.com/chrisbysalt94/finanz-app`
2. "Finanz App" Add-on installieren
3. Add-on starten
4. Im Seitenleisten-Panel "Finanzen" oeffnen
5. Daten in den Einstellungen anpassen

## Architektur

```
finanz-app/
  backend/
    server.js      - Express Server (Port 8099)
    db.js          - SQLite Datenbank (better-sqlite3)
    seed.js        - Beispieldaten (nur beim ersten Start)
    routes/
      budget.js    - Budget CRUD + Berechnungslogik
      persons.js   - Personen verwalten
      categories.js - Kategorien verwalten
      accounts.js  - Bankkonten/IBANs verwalten
      transfers.js - Ueberweisungen
      standing-orders.js - Dauerauftraege
  frontend/
    index.html     - SPA Shell
    app.js         - Vue 3 App
    views/
      Dashboard.js - Budget-Uebersicht
      Transfers.js - Ueberweisungen
      StandingOrders.js - Dauerauftraege
      Settings.js  - Einstellungen
```

## Datenbank

Die Datenbank wird automatisch in `/data/finanz.db` (Home Assistant config) erstellt. Beim ersten Start werden Beispieldaten angelegt, die du in den Einstellungen anpassen kannst.

### Tabellen

- **persons** - Name, Netto-Gehalt, Zweitjob, Investitionsbetrag, Sparbetrag
- **categories** - Hierarchische Kategorien mit Sektionen (income, deductions, savings, fixed, auto, contracts, housing)
- **budget_items** - Budget-Posten mit Betrag, Aufteilungstyp, Zielkonto
- **accounts** - Bankkonten mit IBANs
- **transfers** - Manuelle Ueberweisungen
- **standing_orders** - Dauerauftraege

## Berechnungslogik

### Gehaltsaufteilung
```
Anteil Person = (Gehalt Person + Zweitjob) / Gesamteinkommen
Kosten Person = Gesamtkosten x Anteil Person
```

### Spassgeld (frei verfuegbares Geld)
```
Spassgeld = Gehalt - Investitionen - Sparen - alle Budget-Posten-Anteile
```

### Unterstuetzte Aufteilungsarten
- **Gehaltsabhaengig** (proportional) - Fair nach Einkommen
- **Eigene Prozente** (custom) - Frei waehlbar pro Person (z.B. 70/30)

### Unterstuetzte Betragsarten
- **Fester Betrag** - Euro-Betrag pro Monat
- **Prozent vom Einkommen** - Automatisch berechnet aus Gesamteinkommen

## Zielkonten (target_account)

Budget-Posten koennen ein Zielkonto haben im Format:
- `Zusammen -> Revolut Wohnung` - Gemeinsames Revolut Pocket "Wohnung"
- `Zusammen -> Revolut` - Gemeinsames Revolut Hauptkonto
- `Getrennt -> Altersvorsorge` - Getrennte Konten
- `TradeRepublic` - Investmentkonto

Die App berechnet daraus automatisch die Ueberweisungsbetraege pro Person und Bank.

## Entwicklung

### Lokal starten (ohne Home Assistant)

```bash
cd finanz-app/backend
npm install
node server.js
```

Die App laeuft auf `http://localhost:8099`.

### Technologien

- **Backend**: Node.js, Express, better-sqlite3
- **Frontend**: Vue 3 (CDN), Chart.js
- **Datenbank**: SQLite
- **Container**: Docker (Node 20 Alpine)

## Lizenz

MIT
