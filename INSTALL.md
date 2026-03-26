# Installation - Finanz App fuer Home Assistant

## Voraussetzungen

- Home Assistant (OS oder Supervised) mit Add-on Support
- Supervisor muss laufen

## Schritt 1: Repository hinzufuegen

1. Oeffne Home Assistant
2. Gehe zu **Einstellungen** > **Add-ons** > **Add-on Store**
3. Klicke oben rechts auf die **drei Punkte** (...)
4. Waehle **Repositories**
5. Fuege diese URL hinzu:
   ```
   https://github.com/chrisbysalt94/finanz-app
   ```
6. Klicke **Hinzufuegen** und dann **Schliessen**

## Schritt 2: Add-on installieren

1. Suche im Add-on Store nach **Finanz App**
2. Klicke auf das Add-on
3. Klicke **Installieren**
4. Warte bis die Installation abgeschlossen ist

## Schritt 3: Add-on starten

1. Klicke **Starten**
2. Aktiviere **In der Seitenleiste anzeigen** (optional aber empfohlen)
3. Aktiviere **Beim Starten starten** (optional)

## Schritt 4: App oeffnen und einrichten

1. Klicke auf **Finanzen** in der Seitenleiste (oder oeffne ueber das Panel)
2. Die App startet mit **Beispieldaten** - diese musst du anpassen!
3. Gehe auf den Tab **Einstellungen**

### Personen einrichten

1. Aendere die Namen von "Person 1" und "Person 2" zu euren Namen
   - Dafuer die Datenbank direkt bearbeiten oder die API nutzen (siehe unten)
2. Trage die korrekten **Netto-Gehaelter** ein
3. Optional: Zweitjob-Einkommen hinzufuegen

### Investitionen & Sparen

1. Trage pro Person den **Investitionsbetrag** ein (geht zu TradeRepublic)
2. Trage pro Person den **Sparbetrag** ein (geht zu Revolut Sparkonto)

### Budget-Posten anpassen

1. Bearbeite die Beispiel-Posten mit euren echten Betraegen
2. Setze die richtige **Aufteilung** (gehaltsabhaengig oder eigene %)
3. Setze das richtige **Zielkonto** (z.B. "Zusammen -> Revolut Wohnung")
4. Loesche nicht benoetigte Posten
5. Fuege neue Posten hinzu

### Bankkonten / IBANs einrichten

Die IBANs koennen ueber die API gesetzt werden:

```bash
# Revolut IBAN aendern (Account ID 1 = shared Revolut)
curl -X PUT http://<HA-IP>:8099/api/accounts/1 \
  -H "Content-Type: application/json" \
  -d '{"iban": "DE12 3456 7890 1234 5678 90"}'
```

## Daten sichern

Die Datenbank liegt unter `/data/finanz.db` im Add-on Container. Sie wird automatisch in Home Assistant Backups eingeschlossen.

## Update

1. Gehe zu **Einstellungen** > **Add-ons** > **Finanz App**
2. Klicke **Aktualisieren** wenn eine neue Version verfuegbar ist
3. Deine Daten bleiben erhalten - nur die App wird aktualisiert

## Fehlerbehebung

### Add-on startet nicht
- Pruefe die Logs unter **Einstellungen** > **Add-ons** > **Finanz App** > **Protokoll**
- Stelle sicher, dass Port 8099 nicht von einem anderen Add-on belegt ist

### Daten zuruecksetzen
Um mit frischen Beispieldaten zu starten:
1. Stoppe das Add-on
2. Loesche die Datei `/data/finanz.db` (ueber SSH oder File Editor)
3. Starte das Add-on neu

### Namen aendern
Personen-Namen koennen aktuell ueber die API geaendert werden:

```bash
# Person 1 umbenennen
curl -X PUT http://<HA-IP>:8099/api/persons/1 \
  -H "Content-Type: application/json" \
  -d '{"name": "Max"}'

# Person 2 umbenennen
curl -X PUT http://<HA-IP>:8099/api/persons/2 \
  -H "Content-Type: application/json" \
  -d '{"name": "Lisa"}'
```

## Zielkonto-Format

Budget-Posten koennen ein Zielkonto im folgenden Format haben:

| Format | Bedeutung |
|--------|-----------|
| `Zusammen -> Revolut Wohnung` | Gemeinsames Revolut Pocket "Wohnung" |
| `Zusammen -> Revolut` | Revolut Hauptkonto |
| `Zusammen -> Revolut Verträge` | Revolut Pocket "Vertraege" |
| `Getrennt -> Altersvorsorge` | Getrennte persoenliche Konten |
| `TradeRepublic` | Investment-Konto |

Die App erkennt `Revolut`, `Revolute` und `TradeRepublic` automatisch und gruppiert die Ueberweisungen entsprechend.
