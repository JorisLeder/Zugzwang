# PRD: Schach-Lerntool (Web-App)

Oct 15, 2026 · @Joris

## Zusammenfassung & Produktvision

**Zugzwang** (Arbeitstitel) ist eine reaktive Web-App, mit der eine einzelne Person ihr Schach systematisch verbessert – vom kompletten Neuling bis zum fortgeschrittenen Spieler: Puzzles lösen, gegen Bots und einen erklärenden Coach spielen und strukturierte Lektionen durcharbeiten. Jeder Fortschritt – gelöste Puzzles, abgeschlossene Lektionen, gespielte Partien, Rating – wird sofort gespeichert und ist auf jedem Gerät verfügbar.

Vorbild für Bedienung und Aufbau ist [chess.com](https://www.chess.com): Puzzles mit eigenem Rating, Bots mit Persönlichkeit, Lektionen mit interaktiven Übungen und eine Partieanalyse mit Zugbewertungen. Anders als chess.com ist Zugzwang auf das Lernen optimiert statt auf Online-Spiel gegen Menschen, kostet keine Abo-Gebühr und baut auf freien Engines und Datensätzen auf.

| Eckdaten | V1 |
| --- | --- |
| Plattform | Zuerst Web-App (Desktop und Handy-Browser), danach Mobile-App für iOS und Android aus derselben Codebasis |
| Nutzer | 1 Hauptnutzer, Mehrbenutzer-fähig angelegt |
| Kernmodule | Puzzles · Spielen gegen Bots/Coach · Lektionen · Analyse eigener Partien · Fortschritt/Profil |
| Schach-Engine | Stockfish (WebAssembly, läuft im Browser) |
| Erklärungen | Regelbasiert aus Engine-Daten + LLM-Coach für natürliche Sprache |
| Persistenz | Zentrale Cloud-Datenbank mit Konto und Echtzeit-Sync; auf jedem Gerät derselbe Fortschritt, lokal nur Zwischenspeicher |
| Nicht in V1 | chess.com-Partieanalyse (Import oder Chrome-Extension) – geplant für V2 |

## Problemstellung

Wer sich im Schach verbessern will, braucht drei Dinge zugleich: Taktiktraining, Spielpraxis mit Rückmeldung und strukturiertes Wissen – und alles muss auf den eigenen Fortschritt abgestimmt sein. Heute verteilt sich das auf mehrere Seiten, und die besten Lernfunktionen liegen hinter Bezahlschranken.

- **Fragmentierung:** Puzzles auf Seite A, Bots auf Seite B, Lektionen in Videos auf YouTube. Es gibt keinen gemeinsamen Lernstand, der Schwächen über alle Bereiche hinweg erkennt.
- **Bezahlschranken:** Bei chess.com sind unbegrenzte Puzzles, vollständige Game Reviews und alle Lektionen nur in den Diamond- bzw. Platinum-Abos enthalten; im kostenlosen Plan gibt es täglich nur wenige davon.
- **Kaum menschliche Gegner:** Der Nutzer hat wenige reale Partner. Bots müssen deshalb menschlich und fehleranfällig spielen und nach der Partie erklären, was passiert ist – sonst fehlt die Lernschleife.
- **Erklärungen fehlen:** Engines sagen *dass* ein Zug schlecht ist („−2,3“), aber nicht *warum*. Gerade für Einsteiger und Clubspieler ist das „Warum“ der eigentliche Lerneffekt.

**Kosten des Nicht-Lösens:** Training bleibt unstrukturiert, Fortschritt ist nicht messbar, und typische Fehlermuster (hängende Figuren, übersehene Gabeln, schwache Endspieltechnik) wiederholen sich in jeder Partie.

## Ziele und Nicht-Ziele (V1)

V1 ist erfolgreich, wenn der Nutzer täglich trainiert und sein Puzzle-Rating sowie seine Genauigkeit gegen Bots messbar steigen.

### Ziele

| # | Ziel | Messbar als |
| --- | --- | --- |
| Z1 | Ein Ort für das gesamte Training | Puzzles, Bots und Lektionen in einer App mit gemeinsamem Lernstand |
| Z2 | Messbare Verbesserung | Puzzle-Rating +200 Punkte in 3 Monaten; durchschnittliche Genauigkeit gegen Bots +5 Prozentpunkte |
| Z3 | Verstehen statt nur Bewerten | Jeder Fehler in einer Bot-Partie bekommt eine Erklärung in natürlicher Sprache („Warum“), nicht nur eine Zahl |
| Z4 | Verlässlicher Fortschritt | Kein Fortschrittsverlust: jede abgeschlossene Aktion ist innerhalb von 1 s gespeichert und geräteübergreifend sichtbar |
| Z5 | Gewohnheit aufbauen | Tägliche Ziele und Streaks; ≥ 5 Trainingstage pro Woche |
| Z6 | Training auch am Handy | Ab V1 alle Kernfunktionen im Handy-Browser; nach dem Web-Launch eine eigene App für iOS und Android; auf jedem Gerät derselbe Stand |

### Nicht-Ziele

| Nicht-Ziel | Begründung |
| --- | --- |
| Online-Spiel gegen andere Menschen (Matchmaking, Turniere, Chat) | Kernproblem ist Lernen; Multiplayer braucht Server-Infrastruktur, Fair-Play-Systeme und eine Community, die ein Einzelnutzer nicht hat |
| chess.com-Partieanalyse (Import und Chrome-Extension) | Bewusst auf V2 verschoben; die Architektur wird aber schon in V1 darauf vorbereitet (siehe Ausblick V2) |
| Nutzung ohne Konto oder nur mit lokaler Speicherung | Der Fortschritt muss auf Laptop und Handy gleich sein; er liegt deshalb immer in der Cloud-Datenbank, nicht nur in lokalen Dateien |
| Video-Lektionen und eigene Video-Produktion | Hoher Produktionsaufwand; interaktive Lektionen haben für das Lernen den größeren Effekt |
| Monetarisierung, Abos, Werbung | Persönliches Lerntool; kein Geschäftsmodell in V1 |
| Eigene Engine-Entwicklung | Stockfish und Maia sind frei verfügbar und stärker als alles, was selbst gebaut werden könnte |

## Zielgruppe und Personas

Die primäre Zielgruppe ist der Auftraggeber selbst: ein Einsteiger mit ca. 200 Elo, der die Regeln und grundlegende Taktik kennt, aber kaum Spielpraxis hat und sich ohne Trainer oder Verein verbessern will. Die App soll ihn über die gesamte Schachlaufbahn begleiten und zugleich komplette Neulinge abholen. Weitere Nutzer können später ohne Umbau hinzukommen.

| Persona | Profil | Hauptbedürfnis | Wichtigste Module |
| --- | --- | --- | --- |
| **Der Selbstlerner** (primär, Auftraggeber) | ca. 200 Elo, kennt Regeln und Grundtaktik, wenig Spielpraxis, kaum reale Gegner, 20–60 Min. Training am Tag | Ein Lernpfad von den Grundlagen bis ins Fortgeschrittene und Erklärungen, warum ein Zug gut oder schlecht ist | Lektionen, Coach-Bot, Puzzles |
| **Der komplette Neuling** (sekundär) | Kennt die Regeln nicht oder nur teilweise, hat noch nie eine ganze Partie gespielt | Spielerischer Einstieg: Figuren, Gangarten, Schach und Matt, erste Partien gegen sehr schwache Bots | Lektionen Stufe 0, leichteste Bots, Puzzles im Lernmodus |
| **Der Aufsteiger** (später) | 1200+ Elo – der Selbstlerner in 1–2 Jahren | Strategie, Eröffnungsrepertoire, Endspieltechnik, gezieltes Schwächentraining | Lektionen Stufe 3–4, Themen-Puzzles, Puzzle Rush, Analyse |

**Annahmen zur Nutzung:** Hauptgerät ist der Desktop-Browser für Partien und Lektionen; das Handy wird für kurze Puzzle-Einheiten unterwegs genutzt. Deshalb sind schneller Gerätewechsel und Offline-Puzzles wichtig.

## User Stories

Die Stories sind nach Modul gruppiert und innerhalb jeder Gruppe nach Priorität sortiert. „Ich“ ist immer der Selbstlerner, sofern nicht anders angegeben.

### Onboarding & Konto

1. Als neuer Nutzer will ich mich mit E-Mail oder Google anmelden, damit mein Fortschritt an ein Konto gebunden ist.
2. Als Wiedereinsteiger will ich einen kurzen Einstufungstest (Puzzles + Fragen) machen, damit die App mir passende Lektionen, Puzzles und Bots vorschlägt.
3. Als Nutzer will ich ein wöchentliches Trainingsziel festlegen (z. B. 20 Min./Tag), damit ich eine Gewohnheit aufbaue.

### Puzzles

1. Ich will Puzzles lösen, die zu meinem Rating passen, damit ich gefordert, aber nicht überfordert bin.
2. Ich will nach einem Fehlversuch die Lösung Zug für Zug sehen und erklärt bekommen, welches Motiv dahinter steckt.
3. Ich will Puzzles gezielt nach Motiv trainieren (Gabel, Fesselung, Grundreihenmatt …), damit ich Schwächen ausbügle.
4. Ich will Puzzle Rush (3 Min., 5 Min., „Drei Fehler“) spielen, damit ich Mustererkennung unter Zeitdruck trainiere.
5. Ich will fehlgeschlagene Puzzles später automatisch wiederholen (Spaced Repetition), damit sich Muster festsetzen.
6. Ich will das Tagespuzzle lösen, damit ich auch an vollen Tagen etwas mache.

### Spielen gegen Bots und Coach

1. Ich will gegen Bots verschiedener Stärke (ca. 100–2500 Elo) mit eigener Persönlichkeit spielen, damit ich passende Gegner habe.
2. Ich will einen Coach-Modus, in dem der Bot während der Partie Hinweise gibt und vor groben Fehlern warnt.
3. Ich will Züge zurücknehmen und Tipps abrufen können (abschaltbar), damit ich aus Fehlern direkt lerne.
4. Ich will Bedenkzeit wählen (ohne Uhr, 10+0, 15+10 …), damit ich realistische Bedingungen übe.
5. Ich will eine Partie unterbrechen und später auf einem anderen Gerät fortsetzen.
6. Ich will aus einer beliebigen Stellung (z. B. aus einer Lektion) gegen den Bot weiterspielen.

### Analyse eigener Partien

1. Ich will nach jeder Bot-Partie eine Analyse mit Genauigkeit, Zugklassifizierung (Brillant bis Patzer) und Bewertungsgraph sehen.
2. Ich will zu jedem Fehler eine Erklärung in Worten und den besseren Zug sehen.
3. Ich will bei einem Fehler „Nochmal versuchen“, damit ich den richtigen Zug selbst finde.
4. Ich will eine PGN einfügen oder hochladen, damit ich auch Partien vom Brett oder von anderen Seiten analysiere.

### Lektionen

1. Ich will einem Lernpfad vom Anfänger bis Fortgeschrittenen folgen, damit ich weiß, was als Nächstes kommt.
2. Ich will Lektionen aus Erklärtext, interaktiven Brettbeispielen und Übungen, damit ich aktiv lerne statt nur zu lesen.
3. Ich will eine Lektion mitten drin verlassen und genau dort weitermachen.
4. Ich will am Ende einer Lektion einen kurzen Test, damit ich weiß, ob ich das Thema verstanden habe.

### Fortschritt & Profil

1. Ich will ein Dashboard mit Puzzle-Rating, Bot-Rating, Streak, Lektionsfortschritt und Schwächen sehen.
2. Ich will Verlaufskurven (Rating über Zeit), damit ich Verbesserung sehe.
3. Ich will Empfehlungen „Als Nächstes trainieren“, die auf meinen Fehlern basieren.

### Randfälle

1. Wenn ich offline bin, will ich weiter Puzzles lösen; der Fortschritt wird beim Wiederverbinden synchronisiert.
2. Wenn ich auf zwei Geräten gleichzeitig trainiere, will ich keinen Fortschritt verlieren.
3. Wenn die Engine auf einem schwachen Gerät langsam ist, will ich trotzdem flüssig spielen können (geringere Analysetiefe statt Einfrieren).

## Funktionsumfang V1

V1 besteht aus sechs Modulen. Jedes übernimmt ein bewährtes Muster von chess.com und ersetzt kostenpflichtige Teile durch freie Engines und Daten.

### 1. Puzzles

| Modus | Beschreibung | Vorbild chess.com |
| --- | --- | --- |
| Bewertete Puzzles | Eigenes Puzzle-Rating (Glicko-2). Puzzles werden im Bereich ±150 um das aktuelle Rating gewählt. Hinweis oder Lösung = nicht gelöst | Puzzles (Rated) |
| Lernmodus | Ohne Rating und ohne Zeit, Hinweise und Lösung frei, Erklärung nach jedem Puzzle | Puzzles – Learning |
| Themen-Training | Auswahl nach Motiv (Gabel, Fesselung, Spieß, Abzug, Grundreihe, Matt in 1–5, Endspiel …) und nach Eröffnung | Custom Puzzles |
| Puzzle Rush | 3 Min., 5 Min. oder „Drei Fehler“; Schwierigkeit steigt mit jedem gelösten Puzzle; Bestwerte werden gespeichert | Puzzle Rush |
| Tagespuzzle | Ein gemeinsames Puzzle pro Tag, zählt für den Streak | Daily Puzzle |
| Wiederholung | Fehlgeschlagene Puzzles kommen nach Spaced-Repetition-Plan (z. B. 1, 3, 7, 21 Tage) wieder | – (Erweiterung) |
| Puzzles aus eigenen Fehlern (P1) | Stellungen, in denen der Nutzer gegen Bots gepatzt hat, werden zu Puzzles | – (Erweiterung) |

**Ablauf:** Der Gegner macht den ersten Zug, dann findet der Nutzer die Zugfolge. Falsche Züge werden sofort markiert. Gibt es mehrere Mattzüge, gilt jeder als richtig.

**Hinweise in drei Stufen:** (1) die richtige Figur wird markiert, (2) das Zielfeld wird gezeigt, (3) die Lösung wird gespielt.

**Erklärung nach dem Puzzle:** Motiv-Tags plus 1–3 Sätze, warum die Lösung funktioniert, z. B. „Der Springer greift König und Dame gleichzeitig an; nach dem Königszug geht die Dame verloren.“

### 2. Spielen gegen Bots und Coach

- **Bot-Liste:** 12–15 Bots von ca. 100 bis 2500 Elo, unter 800 besonders fein abgestuft. Jeder Bot hat Name, Avatar, Spielstil (aggressiv, solide, Gambit-Fan …), ein bevorzugtes Eröffnungsrepertoire und kurze Chat-Sprüche – wie die Bot-Persönlichkeiten bei chess.com.
- **Menschliches Spiel:** Im Bereich ca. 800–2000 spielt ein auf menschliche Partien trainiertes Netz (Maia), damit die Bots typische menschliche Fehler machen. Darunter und darüber spielt Stockfish mit begrenzter Stärke (Details unter Technik).
- **Hilfe-Stufen** (pro Partie wählbar):

| Stufe | Was erlaubt ist | Zählt fürs Bot-Rating |
| --- | --- | --- |
| Wettkampf | Keine Hilfen | Ja |
| Training | Züge zurücknehmen, Hinweis auf Anfrage, Bewertungsbalken | Nein |
| Coach | Wie Training, plus aktive Kommentare: Warnung vor groben Fehlern („Bist du sicher? Dein Läufer hängt“), Anzeige gegnerischer Drohungen, Lob für starke Züge | Nein |

- **Bedenkzeit:** ohne Uhr, Blitz (3+2, 5+0), Rapid (10+0, 15+10). Bots nutzen eine realistische Bedenkzeit statt sofort zu ziehen.
- **Fortsetzen:** Eine laufende Partie wird nach jedem Zug gespeichert und kann auf jedem Gerät fortgesetzt werden.
- **Aus Stellung spielen:** Jede Stellung (aus Lektion, Puzzle, Analyse oder per FEN) kann gegen einen Bot ausgespielt werden.
- **Bot-Rating:** Eine Elo-Schätzung des Nutzers aus Wettkampf-Partien gegen Bots.

### 3. Partieanalyse (Game Review)

Nach jeder Bot-Partie läuft automatisch eine Analyse; das gleiche gilt für eingefügte oder hochgeladene PGN-Dateien.

- **Zusammenfassung:** Genauigkeit beider Seiten (0–100 %), Anzahl je Zugkategorie, Bewertungsgraph, 3–5 Schlüsselmomente.
- **Zugklassifizierung** nach dem Prinzip von chess.com: Maßstab ist der Verlust an *erwarteten Punkten* (Gewinnwahrscheinlichkeit), nicht an Centipawns – so zählt ein Fehler in ausgeglichener Stellung mehr als in einer längst gewonnenen.

| Kategorie | Regel |
| --- | --- |
| Brillant (!!) | Bester oder fast bester Zug, der Material opfert und nicht offensichtlich ist |
| Großartig (!) | Einziger guter Zug oder Zug, der eine verlorene Stellung rettet |
| Bester Zug | Verlust 0,00 |
| Exzellent | Verlust bis 0,02 |
| Gut | Verlust 0,02–0,05 |
| Buchzug | Zug aus der Eröffnungstheorie |
| Ungenauigkeit (?!) | Verlust 0,05–0,10 |
| Fehler (?) | Verlust 0,10–0,20 |
| Verpasst | Chance zur Bestrafung eines gegnerischen Fehlers nicht genutzt |
| Patzer (??) | Verlust ab 0,20 |

Schwellen laut [chess.com Support](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-move); Verlust in erwarteten Punkten (0–1).

- **Erklärungen:** Zu jedem Fehler gibt es den besseren Zug als Pfeil, die Folgevariante und 1–3 Sätze, *warum* der Zug schlecht war (z. B. „Nach Sxe5 gewinnt Weiss mit Dh5+ den Turm auf h8“).
- **Nochmal versuchen:** Bei jedem Fehler kann der Nutzer den besseren Zug selbst suchen, bevor er ihn sieht.
- **Variante erkunden:** Freies Weiterspielen ab jeder Stellung mit Live-Engine.
- **Geschätzte Partieleistung (P1):** Elo-Schätzung für die gespielte Partie.

### 4. Lektionen

- **Aufbau:** Lernpfad → Stufe → Kurs → Lektion → Schritt. Fünf Stufen begleiten die gesamte Schachlaufbahn, vom ersten Zug bis ca. 2000 Elo (Lehrplan unten).
- **Einstieg:** Komplette Neulinge beginnen bei Stufe 0. Wer die Regeln kennt, überspringt sie mit einem kurzen Test und startet bei Stufe 1.
- **Schritttypen:**

| Typ | Inhalt |
| --- | --- |
| Erklärung | Text mit Brett, Pfeilen und markierten Feldern |
| Demo | Eine Zugfolge wird Schritt für Schritt mit Kommentar abgespielt |
| Finde den Zug | Nutzer muss den richtigen Zug bzw. die richtige Folge finden; mit Hinweisen |
| Quiz | Multiple-Choice-Frage zur Stellung |
| Ausspielen | Stellung gegen den Bot gewinnen oder halten (z. B. K+D gegen K mattsetzen) |

**Lehrplan über die gesamte Schachlaufbahn**

| Stufe | Elo (ca.) | Kurse | Ausbau |
| --- | --- | --- | --- |
| 0 · Neuling | 0–400 | Brett und Figuren · Schach, Matt und Patt · Sonderregeln und Notation | V1 |
| 1 · Einsteiger | 400–800 | Keine Figuren verschenken (Sicherheits-Check vor jedem Zug) · Taktik-Grundlagen (Gabel, Fesselung, Spieß, Abzug) · Grundmatts und Mattbilder · Eröffnungsprinzipien · Erste Endspiele (Umwandlung, Quadratregel, Opposition) | V1: die ersten drei Kurse; P1: der Rest |
| 2 · Clubspieler | 800–1200 | Kombinationen und Rechnen · Denkprozess am Brett (Kandidatenzüge) · Mattangriffe · Eröffnungsrepertoire für Weiß und Schwarz · Mittelspielpläne · Turmendspiele (Lucena, Philidor) | P1 |
| 3 · Fortgeschritten | 1200–1600 | Bauernstrukturen · Gute und schlechte Figuren · Angriff und Verteidigung · Prophylaxe · Endspieltechnik | Laufend nach dem Launch |
| 4 · Experte | 1600–2000+ | Strategische Opfer und Dynamik · Komplexe Endspiele · Meisterpartien verstehen · Repertoire vertiefen · Zeitmanagement und Turnierpraxis | Laufend nach dem Launch |

Insgesamt rund 24 Kurse mit etwa 120 Lektionen. Die Stufen 3 und 4 entstehen, während der Nutzer aufsteigt – etwa ein Kurs pro Monat.

- **Bewertung:** 1–3 Sterne je Lektion, abhängig von Fehlern und Hinweisen. Am Kursende steht ein Test.
- **Fortschritt:** Wird pro Schritt gespeichert; Wiedereinstieg genau an der verlassenen Stelle.
- **Verzahnung:** Nach jeder Lektion folgen passende Puzzles und eine Übungspartie gegen einen Bot der eigenen Stufe.

### 5. Fortschritt, Profil und Motivation

- **Dashboard (Startseite):** Puzzle-Rating, Bot-Rating, Streak, Tagesziel, nächste Lektion, „Weiter, wo du aufgehört hast“, Empfehlung „Als Nächstes trainieren“.
- **Statistik:** Ratingkurven, Erfolgsquote je Puzzle-Thema, Genauigkeit je Partiephase (Eröffnung, Mittelspiel, Endspiel), häufigste Fehlertypen.
- **Schwächenprofil:** Aus Puzzle-Fehlern und Partieanalysen wird ermittelt, welche Motive und Phasen schwach sind; daraus entstehen Empfehlungen.
- **Gewohnheit:** Tagesziel, Streaks, Abzeichen (P1).
- **Einstufungstest:** 10–15 Puzzles steigender Schwierigkeit und eine kurze Selbsteinschätzung setzen Start-Rating und Lernpfad.

### 6. Werkzeuge und Einstellungen

- **Analysebrett:** Freies Brett mit Engine, Stellung aufbauen, FEN/PGN laden und exportieren.
- **Eröffnungs-Explorer (P1):** Häufigkeit und Erfolg von Zügen aus Meister- und Online-Partien.
- **Einstellungen:** Brett- und Figurendesign, Töne, Zugbestätigung, Hell/Dunkel, Sprache (Deutsch zuerst, Englisch vorbereitet), Notation (deutsch: S, L, T, D, K oder englisch).

## Anforderungen

P0 ist das Minimum für den V1-Launch (16 Anforderungen); P1 folgt direkt danach; P2 wird nicht gebaut, aber in der Architektur berücksichtigt.

### P0 – Muss für V1

| ID | Anforderung | Akzeptanzkriterien |
| --- | --- | --- |
| P0-01 | Konto und Login | Anmeldung per E-Mail-Link und Google; Sitzung bleibt 30 Tage bestehen; ohne Login ist nur eine Demo (5 Puzzles) möglich |
| P0-02 | Fortschritt speichern und synchronisieren | Jede abgeschlossene Aktion (Puzzle-Versuch, Lektionsschritt, Partiezug) ist ≤ 1 s nach der Aktion in der Datenbank; ein zweites geöffnetes Gerät zeigt den neuen Stand ≤ 2 s später ohne Neuladen; offline erledigte Aktionen werden lokal gepuffert und beim Wiederverbinden ohne Duplikate übertragen |
| P0-03 | Schachbrett | Ziehen per Drag-and-drop und per Klick; nur legale Züge; Umwandlungsdialog; Rochade, en passant, Remis-Regeln (Patt, 50 Züge, dreifache Wiederholung, Material); Pfeile und Feldmarkierungen per Rechtsklick; Brett drehen; Zuggeräusche; funktioniert per Touch auf 360 px Breite |
| P0-04 | Bewertete Puzzles | Start-Rating nach Selbsteinschätzung (z. B. 400 für Neulinge, 600 für Einsteiger); für die unterste Stufe kommen sehr leichte Aufgaben (Matt in 1, Figur gewinnen) aus den Lektionen hinzu; Glicko-2-Update nach jedem Versuch; nächstes Puzzle lädt ≤ 300 ms; dasselbe Puzzle erscheint nicht zweimal bewertet |
| P0-05 | Lernmodus mit Hinweisen und Erklärung | Drei Hinweisstufen; Lösung abspielbar; nach jedem Puzzle Motiv-Tags und Erklärung in 1–3 Sätzen |
| P0-06 | Themen-Training | Mindestens 20 Motive wählbar; Filter nach Schwierigkeit; Erfolgsquote je Motiv wird gespeichert |
| P0-07 | Bots | Mindestens 10 Bots zwischen ca. 100 und 2500 Elo, davon mindestens 4 unter 800, mit Name, Avatar und Stil; die Bots im Bereich 800–2000 spielen menschenähnlich (keine perfekten Züge mit eingestreuten Zufallspatzern) |
| P0-08 | Hilfe-Stufen | Wettkampf, Training, Coach; im Coach-Modus erscheint vor einem Zug, der ≥ 0,20 erwartete Punkte verliert, eine Warnung mit Begründung; Zurücknehmen unbegrenzt in Training und Coach |
| P0-09 | Partie fortsetzen | Partiestand wird nach jedem Zug gespeichert; nach Browser-Neustart oder Gerätewechsel geht es am selben Zug weiter |
| P0-10 | Partieanalyse | Analyse einer 40-Züge-Partie ist auf einem Mittelklasse-Laptop ≤ 30 s fertig, mit Fortschrittsanzeige; Genauigkeit, Zugklassifizierung, Bewertungsgraph, bester Zug je Stellung |
| P0-11 | Erklärung von Fehlern | Jeder Fehler und Patzer erhält eine Erklärung in Worten; die Erklärung nennt nur Züge und Fakten, die die Engine bestätigt hat; ist der Erklärdienst nicht erreichbar, erscheint eine regelbasierte Kurz-Erklärung |
| P0-12 | Lektions-Engine | Fünf Schritttypen (Erklärung, Demo, Finde den Zug, Quiz, Ausspielen); Fortschritt pro Schritt; Wiedereinstieg an derselben Stelle |
| P0-13 | Lektionsinhalte zum Launch | Lernpfad Stufe 0 (Neuling) komplett und die drei ersten Kurse von Stufe 1 (Einsteiger): 6 Kurse, ca. 30 Lektionen; jede „Finde den Zug“-Lösung ist von der Engine geprüft |
| P0-14 | Dashboard | Zeigt Puzzle-Rating, Bot-Rating, Streak, Tagesziel, nächste Lektion und „Weiter, wo du aufgehört hast“ |
| P0-15 | PGN-Import | PGN einfügen oder Datei hochladen; ungültige PGN führt zu verständlicher Fehlermeldung mit Zeilenangabe; Partie wird analysiert und gespeichert |
| P0-16 | Responsive Web-App | Nutzbar von 360 px bis 2560 px Breite; als PWA installierbar; Lighthouse-Performance ≥ 85 auf Mobil |

**Beispiel Given/When/Then (P0-02):**

- *Gegeben* ich bin auf Laptop und Handy angemeldet, *wenn* ich auf dem Laptop eine Lektion abschließe, *dann* zeigt das Handy die Lektion ≤ 2 s später als abgeschlossen.
- *Gegeben* ich bin offline, *wenn* ich 5 Puzzles löse und die Verbindung zurückkommt, *dann* sind alle 5 Versuche genau einmal gespeichert und das Rating ist korrekt neu berechnet.
- *Gegeben* ein Speichern schlägt fehl, *dann* sehe ich einen dezenten Hinweis „Nicht synchronisiert“ und es wird automatisch erneut versucht – die Aktion geht nicht verloren.

### P1 – Direkt nach dem Launch

| ID | Anforderung | Akzeptanzkriterien |
| --- | --- | --- |
| P1-01 | Puzzle Rush | Modi 3 Min., 5 Min., Drei Fehler; Bestwert je Modus gespeichert |
| P1-02 | Tagespuzzle | Ein Puzzle pro Kalendertag (Zeitzone des Nutzers); zählt zum Streak |
| P1-03 | Wiederholung (Spaced Repetition) | Fehlgeschlagene Puzzles erscheinen nach Plan erneut; eigene Warteschlange „Fällig heute“ |
| P1-04 | Puzzles aus eigenen Fehlern | Aus jedem Patzer einer analysierten Partie entsteht ein Puzzle, sofern genau ein klar bester Zug existiert |
| P1-05 | Einstufungstest | 10–15 Puzzles; setzt Start-Rating und empfiehlt Kurs und Bot |
| P1-06 | Bedenkzeit und Uhr | Blitz- und Rapid-Zeitkontrollen mit Inkrement; Zeitüberschreitung beendet die Partie |
| P1-07 | Eröffnungs-Explorer | Zugstatistik aus Meister- und Online-Partien für die aktuelle Stellung |
| P1-08 | Geschätzte Partieleistung | Elo-Schätzung pro Partie in der Analyse |
| P1-09 | Vollständige Lektionsinhalte | Rest von Stufe 1 und Stufe 2 (Clubspieler) komplett; Stufen 3 und 4 folgen laufend |
| P1-10 | Abzeichen und Statistiken | Abzeichen für Meilensteine; Statistik je Motiv und Partiephase |
| P1-11 | Mobile-App für iOS und Android | Für den Eigengebrauch ohne Store installierbar: auf Android als APK, auf dem iPhone als Web-App auf dem Home-Bildschirm; Veröffentlichung in den Stores nur optional; Anmeldung mit demselben Konto zeigt denselben Fortschritt wie die Web-App; alle Kernfunktionen inkl. Engine laufen auf dem Gerät; offline gelöste Puzzles werden beim nächsten Verbindungsaufbau übertragen; Erinnerung ans Tagesziel per Push (abschaltbar) |

### P2 – Später, aber architekturrelevant

| ID | Thema | Was die Architektur jetzt schon vorsehen muss |
| --- | --- | --- |
| P2-01 | chess.com-Partien importieren und analysieren (V2) | Partie-Tabelle mit Feld `source` (bot, pgn, chesscom, lichess) und externer ID; Analyse-Pipeline unabhängig von der Herkunft |
| P2-02 | Chrome-Extension für chess.com (V2) | Öffentliche, authentifizierte API zum Anlegen einer Partie und Öffnen der Analyse per Link |
| P2-03 | Lichess-Import | Wie P2-01 |
| P2-04 | Eröffnungsrepertoire-Trainer | Lektionsformat muss Zugbäume (Varianten) abbilden können |
| P2-05 | Mehrere Nutzer, Trainer-Ansicht | Alle Daten von Anfang an pro Nutzer getrennt und per Zugriffsregeln geschützt |
| P2-06 | Sprachausgabe des Coaches | Erklärungen als reiner Text gespeichert, damit sie vorgelesen werden können |

## UX und Informationsarchitektur

Der Aufbau folgt chess.com: links eine Seitenleiste mit sechs Bereichen, in der Mitte das Brett, rechts ein Panel mit Kontext (Coach, Züge, Erklärung). Am Handy wird daraus eine Tab-Leiste unten, das Brett oben und das Panel darunter.

&#91;embedded content: Informationsarchitektur · 6 Bereiche\]

Jeder Bereich ist von überall mit einem Klick erreichbar; die Startseite führt direkt zur nächsten sinnvollen Aktion.

### Gestaltungsregeln

- **Ein Layout für alle Brett-Bildschirme** (Puzzle, Partie, Analyse, Lektion): Brett so groß wie die Fensterhöhe erlaubt, Panel rechts mit Reitern (Züge, Coach, Analyse). Am Handy liegt das Brett in voller Breite oben, Aktionen in einer festen Leiste unten.
- **Farbcodes wie bei chess.com:** Brillant und Großartig blau-türkis, Bester und Exzellent grün, Ungenauigkeit gelb, Fehler orange, Patzer rot – als Symbol direkt an der Figur auf dem Brett und in der Zugliste.
- **Coach-Panel:** Avatar mit Sprechblase; höchstens 3 Sätze, „Mehr erfahren“ klappt Details und Varianten aus.
- **Töne und Animation:** Zug, Schlag, Schach, Erfolg, Fehler; Animationen ≤ 200 ms; alles abschaltbar.
- **Dunkles Design als Standard**, helles wählbar; Kontrast nach WCAG AA; Pfeiltasten für vor/zurück in Analyse und Lektionen.
- **Leere und Fehlerzustände:** keine Partien → Vorschlag für einen passenden Bot; Engine lädt → Fortschrittsbalken; offline → Hinweisbanner, Puzzles laufen weiter.

### Kern-Abläufe

1. **Erster Start:** Login → Selbsteinschätzung (später Einstufungstest) → Startseite mit erstem Kurs, passendem Bot und einem Puzzle-Start-Rating passend zur Selbsteinschätzung.
2. **Tägliche Einheit (20 Min.):** Startseite → Tagespuzzle → 10 bewertete Puzzles → Lektion fortsetzen → Tagesziel erreicht.
3. **Bot-Partie:** Bot wählen → Hilfe-Stufe und Bedenkzeit → Partie → Analyse mit Erklärungen → „Nochmal versuchen“ bei Fehlern → Fehler landen in der Wiederholung.
4. **Lektion:** Lernpfad → Kurs → Lektion Schritt für Schritt → Übung → Sterne → nächste Lektion wird freigeschaltet.

## Technische Architektur

Rechenintensive Teile (Engine, Bots) laufen im Browser. So bleibt die App schnell, offline-fähig und fast kostenlos im Betrieb. Ein schlankes Backend (Supabase) speichert den Fortschritt, synchronisiert alle Geräte live und hält den Schlüssel für die Claude API geheim.

&#91;embedded content: Systemarchitektur · Browser, Backend, externe Dienste\]

Der Browser schreibt jede Aktion zuerst lokal und dann ins Backend; andere Geräte erhalten die Änderung über Realtime. In V2 kommen chess.com-Partien über dieselben Edge Functions herein.

### Tech-Stack

| Schicht | Wahl | Begründung |
| --- | --- | --- |
| Frontend | React + TypeScript + Vite, als PWA | Großes Ökosystem, kein Server-Rendering nötig, installierbar |
| UI | Tailwind CSS + shadcn/ui | Schnelles, einheitliches Design mit Hell/Dunkel |
| Zustand | Zustand (UI) + TanStack Query (Serverdaten) | Klare Trennung, Caching und optimistische Updates eingebaut |
| Brett und Regeln | react-chessboard + chess.js | MIT/BSD-Lizenz, ausgereift |
| Engine | npm `stockfish` (Stockfish 19, Lite single-threaded) im Web Worker | Kein Sonder-Header nötig; später multi-threaded mit COOP/COEP |
| Menschliche Bots | Maia-2 über `onnxruntime-web` | Läuft im Browser, wie bei maiachess.com |
| Offline | IndexedDB (Dexie) + Service Worker | Puzzle-Vorrat und Warteschlange für ungesendete Aktionen |
| Backend | Supabase: Postgres, Auth, Realtime, Edge Functions, Row Level Security | Relationale Daten für Puzzle-Auswahl und Statistik; Live-Sync eingebaut; EU-Region wählbar |
| Sprachmodell | Claude API über eine Edge Function | Schlüssel bleibt im Backend; Rate-Limit pro Nutzer |
| Hosting | Vercel oder Cloudflare Pages | Statisches Hosting, Header für COOP/COEP setzbar |
| Tests | Vitest (Logik), Playwright (Abläufe) | Klassifizierung, Rating und Sync müssen zuverlässig sein |

Firebase wurde verworfen: Die Offline-Synchronisation wäre eingebaut, aber die Puzzle-Auswahl nach Rating und Motiv sowie die Statistiken brauchen SQL.

**Mobile-App:** Nach dem Web-Launch wird dieselbe React-App mit [Capacitor](https://capacitorjs.com) als App für iOS und Android verpackt. Oberfläche, Engine und Datenbank bleiben gleich; neu sind nur App-Symbole und Push-Erinnerungen. Für den Eigengebrauch wird die Android-App als APK direkt installiert, ganz ohne Play-Store-Konto. Auf dem iPhone dient die installierbare Web-App als App, denn eigene iOS-Apps ohne bezahltes Apple-Konto laufen nur 7 Tage und müssen dann neu aufgespielt werden. Ein Neubau mit React Native wäre erst nötig, wenn die eingebettete Browser-Ansicht auf dem Handy zu langsam ist.

**Hinweis Android:** Google führt eine Entwickler-Verifizierung auch für direkt installierte Apps ein – ab 30. September 2026 in ersten Ländern, 2027 weltweit ([Android Developers Blog](https://android-developers.googleblog.com/2026/03/android-developer-verification-rolling-out-to-all-developers.html)). Für private Apps gibt es ein kostenloses Konto für Hobbyentwickler (bis 20 Geräte), und die Installation per ADB vom Rechner bleibt ausgenommen ([Gadget Hacks](https://android.gadgethacks.com/news/google-android-sideloading-rules-2026-changes-explained/)). Vor Phase 5 prüfen.

### Datenmodell

| Tabelle | Wichtige Felder | Hinweis |
| --- | --- | --- |
| `profiles` | id, Name, Einstellungen (JSON), Tagesziel in Minuten | 1 Zeile pro Nutzer |
| `ratings` | user\_id, Art (puzzle, bot, rush\_3, rush\_5, survival), Rating, RD, Volatilität | Glicko-2-Werte, serverseitig berechnet |
| `puzzles` | Lichess-ID, FEN, Züge, Rating, Themen\[\], Eröffnung\[\], Popularität, Erklärung | Erklärung wird einmal erzeugt und gespeichert |
| `puzzle_attempts` | Client-UUID, user\_id, puzzle\_id, Modus, gelöst, Hinweis genutzt, Zeit, Rating vorher/nachher | Nur anhängen, nie ändern |
| `review_queue` | user\_id, Typ (Puzzle, eigener Fehler), Objekt-ID, fällig am, Intervall | Spaced Repetition |
| `games` | id, user\_id, `source` (bot, pgn, chesscom, lichess), externe ID, Bot, Hilfe-Stufe, Bedenkzeit, PGN, Status, Ergebnis | Externe ID verhindert Doppelimporte (V2) |
| `game_moves` | game\_id, Zugnummer, Zug, FEN danach, Zeitstempel | Jeder Zug einzeln gespeichert, damit Fortsetzen überall klappt |
| `game_analyses` | game\_id, Engine-Version, Tiefe, Genauigkeit Weiss/Schwarz, Züge (JSON: Bewertung, bester Zug, Kategorie, Erklärung) | Neu berechenbar bei neuer Engine |
| `bots` | id, Name, Avatar, Elo, Engine (maia, stockfish), Stil, Eröffnungsrepertoire | Statische Daten |
| `courses`, `lessons`, `lesson_steps` | id, Stufe, Reihenfolge, Version, Inhalt (JSON) | Inhalte liegen versioniert im Git-Repository und werden beim Deploy eingespielt |
| `lesson_progress` | user\_id, lesson\_id, aktueller Schritt, abgeschlossen, Sterne, Fehler | Bei Konflikt gewinnt der weiteste Fortschritt |
| `daily_activity` | user\_id, Datum, Minuten, Puzzles, Partien, Lektionen, Ziel erreicht | Grundlage für Streak und Statistik |
| `theme_stats` | user\_id, Motiv, Versuche, Erfolge | Grundlage für Schwächenprofil |

### So wird „reaktiv“ umgesetzt

Der Fortschritt liegt immer in der Cloud-Datenbank, nie nur in lokalen Dateien. Dafür braucht es ein Konto und zum Abgleich eine Internetverbindung; ohne Netz läuft das Training weiter und wird beim nächsten Verbindungsaufbau übertragen. Web-App und Mobile-App lesen und schreiben dieselben Daten.

1. **Optimistische Anzeige:** Jede Aktion erscheint sofort, ohne auf den Server zu warten.
2. **Warteschlange:** Jede Aktion bekommt im Browser eine UUID, landet in IndexedDB und wird dann gesendet. Der Server ignoriert Duplikate, deshalb ist erneutes Senden immer sicher.
3. **Eine Quelle der Wahrheit:** Ratings, Streaks und Statistiken berechnet der Server; der Browser zeigt bis zur Bestätigung einen vorläufigen Wert.
4. **Live-Updates:** Andere geöffnete Geräte abonnieren die eigenen Tabellen über Realtime und aktualisieren sich ohne Neuladen.
5. **Konfliktregeln:** Versuche und Züge werden nur angehängt und können nicht kollidieren. Beim Lektionsfortschritt gewinnt der weiteste Stand, bei Einstellungen der letzte Schreibvorgang.
6. **Laufende Partie auf zwei Geräten:** Das zweite Gerät fragt „Partie läuft auf einem anderen Gerät – hier übernehmen?“.

### Analyse-Pipeline

1. Eröffnungszüge über die Eröffnungsdatenbank als Buchzüge erkennen.
2. Für jede Stellung zuerst Lichess Cloud-Eval abfragen; fehlt sie, rechnet Stockfish lokal (Tiefe 16–18, zwei Varianten).
3. Bewertung in Gewinnwahrscheinlichkeit umrechnen, Verlust an erwarteten Punkten bestimmen, Zug klassifizieren, Genauigkeit berechnen.
4. Für jeden Fehler Motive per Regeln erkennen: hängende Figur, Gabel, Fesselung, Mattdrohung, Materialverlust.
5. Die Fakten an Claude senden; die Antwort (1–3 Sätze) wird geprüft – jeder genannte Zug muss legal und Teil der Engine-Variante sein – und gespeichert.

Gewinnwahrscheinlichkeit aus der Bewertung in Centipawns (cp), nach der Formel von Lichess:

```latex
W(cp) = 50 + 50 \cdot \left( \frac{2}{1 + e^{-0.00368208 \cdot cp}} - 1 \right)
```

Genauigkeit eines Zuges aus dem Verlust an Gewinnwahrscheinlichkeit:

```latex
A = 103.1668 \cdot e^{-0.04354 \cdot (W_{vorher} - W_{nachher})} - 3.1669
```

Die Konstanten stammen aus der [Genauigkeits-Erklärung von Lichess](https://lichess.org/page/accuracy) und werden vor der Umsetzung noch einmal gegen die Quelle geprüft.

### Bots: Technik je Stärke

| Bereich | Engine | Wie er spielt |
| --- | --- | --- |
| ca. 100–700 | Stockfish mit Skill Level 0–3 | Sehr schwach; zusätzlich häufige grobe Fehler nach Regeln (z. B. Figuren hängen lassen) |
| ca. 800–2000 | Maia-2 mit Ziel-Elo | Wählt Züge nach der Wahrscheinlichkeit, mit der ein Mensch dieser Stärke sie spielt |
| ca. 2100–2500 | Stockfish mit `UCI_LimitStrength` und `UCI_Elo` | Stark und solide |

Alle Bots spielen die ersten Züge aus ihrem Eröffnungsrepertoire und nehmen sich 1–8 s Bedenkzeit, je nach Komplexität der Stellung.

### Nicht-funktionale Anforderungen

| Bereich | Anforderung |
| --- | --- |
| Performance | Erste Seite in ≤ 2,5 s bedienbar (4G); Bot-Antwort ≤ 1 s ohne künstliche Bedenkzeit; Puzzle-Wechsel ≤ 300 ms |
| Offline | ≥ 200 Puzzles im lokalen Vorrat; geöffnete Kurse offline verfügbar |
| Sicherheit | Row Level Security: jeder sieht nur eigene Daten; Claude-Schlüssel nur in der Edge Function; höchstens 200 Erklärungen pro Nutzer und Tag |
| Datenschutz | Datenbank in EU-Region (Frankfurt); nur nötige Daten; Konto exportieren und löschen möglich |
| Browser | Aktuelle Versionen von Chrome, Edge, Firefox, Safari (auch iOS) |
| Barrierefreiheit | WCAG 2.2 AA, wo möglich; vollständige Tastaturbedienung |
| Qualität | Unit-Tests für Klassifizierung, Rating und Sync; E2E-Tests für die vier Kern-Abläufe |

## Recherche: Engines, Bots, APIs und Daten

Alle Kernbausteine gibt es frei: Stockfish für Analyse, Maia für menschliche Bots, die Lichess-Datenbank für über 6 Mio. Puzzles und Claude für Erklärungen. Der wichtigste Lizenzpunkt ist GPL/AGPL: Wer Stockfish oder chessground ausliefert, muss den Quellcode der App offenlegen – für ein persönliches Projekt unkritisch, aber eine bewusste Entscheidung.

### Engines und Bots

| Baustein | Was es ist | Lizenz | Einsatz in Zugzwang |
| --- | --- | --- | --- |
| [Stockfish.js](https://github.com/nmrugg/stockfish.js) (npm `stockfish`) | Stockfish 19 als WebAssembly. Varianten: Lite single-threaded ≈ 1,7 MB, Lite multi-threaded ≈ 1,6 MB, Full ≈ 94 MB. Multi-threaded braucht die Header COOP/COEP (Cross-Origin-Isolation) | GPL-3.0 | Partieanalyse, Hinweise, Coach-Warnungen, starke Bots (2000+), Prüfung von Lektionslösungen. Start mit Lite single-threaded im Web Worker |
| [Maia-2](https://github.com/CSSLab/maia2) | Ein einheitliches Modell, das menschliche Züge für jede Spielstärke vorhersagt (NeurIPS 2024); Python-Paket `maia2` | MIT | Menschenähnliche Bots im Bereich ca. 800–2000; Export nach ONNX für den Browser nötig (nicht offiziell dokumentiert) |
| [Maia-3](https://github.com/CSSLab/maia3) | Transformer-Familie (5M, 23M, 79M Parameter), läuft als UCI-Engine; das 5M-Modell ist für CPU gedacht | AGPL-3.0 | Alternative mit höherer Genauigkeit; eher serverseitig betreiben |
| [Maia Platform Frontend](https://github.com/CSSLab/maia-platform-frontend) | Web-Oberfläche von maiachess.com; führt Maia per `onnxruntime-web` im Browser aus und nutzt Stockfish-WASM | GPL-3.0 | Referenz, dass Maia im Browser läuft; Vorlage für die Integration |
| Stockfish „Skill Level“ / „UCI\_Elo“ | Eingebaute Stärkebegrenzung von Stockfish | GPL-3.0 | Nur für sehr schwache (< 800) und starke Bots (> 2000); spielt sonst unnatürlich (perfekte Züge plus zufällige Patzer) |

### Schach-Logik und Brett

| Bibliothek | Zweck | Lizenz | Empfehlung |
| --- | --- | --- | --- |
| [chess.js](https://github.com/jhlywa/chess.js) | Zuggenerierung, Regeln, Schach/Matt/Remis, PGN; TypeScript | BSD-2-Clause | Ja – Standard für die Regel-Logik |
| [react-chessboard](https://github.com/Clariity/react-chessboard) | React-Brettkomponente mit Drag-and-drop, eigenen Figuren, Animation, Touch, TypeScript | MIT | Ja – empfohlen für V1 |
| [chessground](https://www.npmjs.com/package/chessground) | Das Brett von Lichess; sehr performant, Pfeile und Prämoves eingebaut, keine Schachlogik | GPL-3.0 (gilt für die gesamte Website) | Alternative, falls ohnehin GPL wegen Stockfish |

### Daten

| Datensatz | Inhalt | Lizenz | Einsatz |
| --- | --- | --- | --- |
| [Lichess-Puzzle-Datenbank](https://database.lichess.org/#puzzles) | ≈ 6,06 Mio. bewertete und getaggte Puzzles als CSV (`PuzzleId, FEN, Moves, Rating, RatingDeviation, Popularity, NbPlays, Themes, GameUrl, OpeningTags`), monatlich aktualisiert | CC0 (laut [Lichess](https://lichess.org/@/Lichess/blog/lichess-end-of-year-update-2025/YRiNKoaQ)) | Puzzle-Bestand; Import einer Auswahl von ca. 300.000–500.000 Puzzles (hohe Popularität, viele Spiele) |
| [Lichess-Datenbank](https://github.com/lichess-org/database): Partien und Engine-Bewertungen | Alle bewerteten Partien sowie vorberechnete Stellungsbewertungen | CC0 | Bewertungs-Cache, Eröffnungsstatistik, später Training eigener Modelle |
| [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) | Eröffnungsnamen mit ECO-Code, PGN und EPD in 5 TSV-Dateien | CC0-1.0 | Eröffnungserkennung, „Buchzug“-Klassifizierung, Lektionen |

### Externe APIs

| API | Zweck | Zugang | Einsatz |
| --- | --- | --- | --- |
| [Lichess API](https://lichess.org/api): Cloud-Eval, Opening Explorer, Tablebase | Bewertungen bereits analysierter Stellungen, Zugstatistik, perfekte Endspiel-Bewertung (bis 7 Steine) | Kostenlos; Rate-Limits beachten, bei HTTP 429 warten | Schnellere Analyse, Eröffnungs-Explorer (P1), Endspiel-Lektionen |
| [chess.com Published-Data API](https://www.chess.com/news/view/published-data-api) | Nur lesend, ohne API-Key: Monatsarchive eines Spielers unter `/pub/player/{name}/games/{YYYY}/{MM}` mit PGN je Partie | Kostenlos; Anfragen nacheinander, nicht parallel (sonst 429) | V2: Import eigener chess.com-Partien |
| [Claude API](https://docs.claude.com) (Anthropic) | Sprachmodell für Erklärungen und Coach-Kommentare | Bezahlt pro Token; Schlüssel nur serverseitig | Standard: Claude Opus 5.5 (`claude-opus-5-5`, 4 $ / 20 $ pro Mio. Eingabe-/Ausgabe-Token). Günstigere Option zur Wahl des Auftraggebers: Claude Haiku 5.5 (`claude-haiku-5-5`, 0,10 $ / 0,50 $) |

**Kostenschätzung Erklärungen:** Eine Erklärung braucht ca. 1.500 Eingabe- und 150 Ausgabe-Token. Mit Opus 5.5 sind das rund 0,9 Cent, mit Haiku 5.5 rund 0,02 Cent. Puzzle-Erklärungen werden pro Puzzle einmal erzeugt und gespeichert. Bei 60 Partien mit je 5 erklärten Fehlern pro Monat ergeben sich mit Opus 5.5 etwa 3 $ pro Monat.

### Vorbilder und Referenzen

- [Lichess (lila)](https://github.com/lichess-org/lila) – Open-Source-Referenz für Puzzles, Analyse und Lern-Bereich (AGPL-3.0; Code nicht kopieren, nur als Vorbild).
- [chess.com Game Review](https://www.chess.com/terms/game-review) – Vorbild für Zugklassifizierung und Erklärungen.
- Lichess-Bots [maia1/5/9](https://lichess.org/player/bots) – zeigen die Spielqualität von Maia; nur auf Lichess spielbar, nicht einbettbar.

## Ausblick V2: Analyse echter chess.com-Partien

**Empfehlung:** Zuerst den Import über die Website bauen (V2a), danach eine schlanke Chrome-Extension, die nur einen Button „In Zugzwang analysieren“ bei beendeten Partien einblendet (V2b). Beide Wege füllen dieselbe Analyse-Pipeline wie in V1. Die Extension führt auf chess.com selbst keine Engine aus.

### Die zwei Wege im Vergleich

| Kriterium | V2a: Import über die Website | V2b: Chrome-Extension |
| --- | --- | --- |
| Ablauf | Nutzer hinterlegt seinen chess.com-Namen einmal; neue Partien werden automatisch geholt, analysiert und als Liste angezeigt | Auf einer beendeten Partie bei chess.com erscheint ein Button; ein Klick öffnet die Analyse in Zugzwang |
| Datenquelle | Offizielle Published-Data API (Monatsarchive mit PGN, ohne API-Key) | Partie-ID aus der URL der chess.com-Seite; PGN wird über dieselbe API oder aus der Seite gelesen |
| Geräte | Alle, auch Handy | Nur Desktop-Chrome (und Chromium-Browser) |
| Aufwand | Gering: ein Server-Endpunkt plus Partieliste | Mittel: Extension (Manifest V3), Veröffentlichung im Chrome Web Store, Pflege bei Änderungen an chess.com |
| Wartungsrisiko | Niedrig: stabile, dokumentierte API | Höher: Änderungen an der Seite von chess.com können den Button brechen |
| Fair-Play-Risiko | Keins: läuft komplett außerhalb von chess.com | Vorhanden: chess.com verbietet Erweiterungen, die *während* einer Partie Stellungen analysieren, und sperrt Konten dafür ([Fair Play Policy](https://www.chess.com/legal/fair-play)) |
| Komfort | Partie erscheint nach kurzer Verzögerung automatisch | Sofort und direkt am Ort der Partie |

### Leitplanken für die Chrome-Extension

- Aktiv nur auf Seiten **beendeter** Partien (Archiv, Ergebnis vorhanden); auf laufenden Partien ist die Extension komplett inaktiv.
- Keine Engine, keine Bewertung und keine Pfeile auf chess.com-Seiten. Die Extension übergibt nur die Partie-ID bzw. PGN an Zugzwang.
- Minimale Berechtigungen: nur `chess.com/game/*` und die Zugzwang-Domain.
- Anmeldung über die bestehende Zugzwang-Sitzung; die Partie wird über die Import-API von V2a angelegt.
- Vorbilder: [Chesscomputer](https://chromeboard.com/extension/chesscomputer-mgbdjmochkcdciojgkgjopgkhbnjhbjp) (Analyse erst nach Partieende) und [Lichess Analyzer](https://chromeboard.com/extension/lichess-analyzer-fdnpomkdbccglakofideabdlaiabbekb) (übergibt die Partie an das Analysebrett von Lichess; AGPL-3.0).

### Was V1 schon dafür vorbereitet

- Partien haben ein Feld `source` (`bot`, `pgn`, `chesscom`, `lichess`) und eine externe ID, damit Doppelimporte erkannt werden.
- Die Analyse ist ein eigener Dienst, der mit jeder PGN arbeitet – egal woher sie kommt.
- Ein Endpunkt `POST /games/import` (PGN oder externe ID) wird schon in V1 für den PGN-Import genutzt.
- Analysen öffnen sich per Deep-Link `/analysis/{gameId}`, den eine Extension später aufrufen kann.

### V2-spezifische Funktionen

- **Automatischer Sync:** Neue chess.com-Partien werden beim Öffnen der App und einmal täglich geholt.
- **Schwächen aus echten Partien:** Fehler aus chess.com-Partien fließen ins Schwächenprofil und werden zu Wiederholungs-Puzzles.
- **Eröffnungsbericht:** Welche Eröffnungen der Nutzer spielt und wo er am häufigsten verliert.

Die chess.com-API sollte serverseitig abgefragt werden: Sie erwartet einen erkennbaren User-Agent mit Kontaktangabe, und Anfragen müssen nacheinander laufen.

## Erfolgsmetriken

Die wichtigste Kennzahl ist die Lernkurve: Puzzle-Rating und Genauigkeit gegen Bots müssen über 3 Monate steigen. Alle Werte kommen aus den eigenen Daten der App; ein Statistik-Bildschirm zeigt sie an, externe Analyse-Tools sind nicht nötig.

### Frühe Indikatoren (Tage bis Wochen)

| Metrik | Ziel | Messung |
| --- | --- | --- |
| Trainingstage pro Woche | ≥ 5 | Tage mit mindestens einer abgeschlossenen Aktion |
| Trainingszeit pro Tag | ≥ 20 Min. im Schnitt | Summe der aktiven Zeit in Puzzles, Partien und Lektionen |
| Puzzles pro Woche | ≥ 100 | Anzahl Puzzle-Versuche |
| Bot-Partien pro Woche | ≥ 3 | Beendete Partien |
| Analysen angesehen | ≥ 80 % der Bot-Partien | Geöffnete Game Reviews / beendete Partien |
| „Nochmal versuchen“ genutzt | ≥ 50 % der Fehler | Retry-Versuche / klassifizierte Fehler |
| Sync-Fehlerquote | < 0,1 % der Schreibvorgänge | Fehlgeschlagene und nicht nachgeholte Speichervorgänge |

### Späte Indikatoren (Wochen bis Monate)

| Metrik | Erfolg | Stretch | Messung |
| --- | --- | --- | --- |
| Puzzle-Rating | +200 in 3 Monaten | +350 | Glicko-2-Rating im Verlauf |
| Genauigkeit gegen Bots (Wettkampf) | +5 Prozentpunkte in 3 Monaten | +10 | Mittelwert der letzten 10 Partien |
| Patzer pro Partie | −30 % in 3 Monaten | −50 % | Anzahl der als Patzer klassifizierten Züge |
| Bot-Rating | +150 in 3 Monaten | +300 | Elo-Schätzung aus Wettkampf-Partien |
| Lernpfad | 3 Kurse abgeschlossen in 3 Monaten | 5 Kurse | Abgeschlossene Kurse |
| Erfolgsquote im schwächsten Motiv | +15 Prozentpunkte | +25 | Erfolgsquote je Puzzle-Thema |

### Qualität der Erklärungen

- **Korrektheit:** ≥ 95 % der Erklärungen sind schachlich korrekt (Stichprobe von 50 Erklärungen pro Monat, manuell geprüft).
- **Nützlichkeit:** Daumen hoch/runter unter jeder Erklärung; Ziel ≥ 80 % positiv.

**Auswertung:** nach 2 Wochen (Nutzung), nach 1 Monat (frühe Lernwirkung), nach 3 Monaten (Lernkurve).

## Roadmap und Meilensteine

V1 ist nach rund 12 Wochen fertig, wenn ein Entwickler kontinuierlich daran arbeitet. Die Reihenfolge folgt dem Lernnutzen: Puzzles liefern ab Woche 5 täglichen Wert, Bots und Analyse ab Woche 9, Lektionen zum Launch. Die Mobile-App folgt nach dem P1-Ausbau ab Woche 17.

&#91;embedded content: Roadmap · 4 Phasen bis V1, dann P1 und V2\]

Die erste Entscheidung fällt schon nach Woche 2: Ob Maia im Browser läuft, bestimmt die Bot-Architektur für Phase 2.

### Abhängigkeiten

- Lektionsinhalte sind der längste Strang und starten deshalb ab Woche 5 parallel zur Entwicklung.
- Die Partieanalyse (Phase 2) braucht die Engine aus Phase 0 und die Sync-Schicht aus Phase 1.
- Die Mobile-App (Phase 5) verpackt die bestehende Web-App. Sie setzt voraus, dass die Oberfläche schon in V1 ab 360 px Breite funktioniert (P0-16) und der Fortschritt vollständig in der Cloud-Datenbank liegt (P0-02).
- V2 braucht das Feld `source` an Partien und den Endpunkt `POST /games/import` – beides entsteht schon in V1.

### Definition of Done für V1

- [ ] Alle 16 P0-Anforderungen erfüllen ihre Akzeptanzkriterien
- [ ] Vier Kern-Abläufe laufen als End-to-End-Tests auf Desktop und Handy
- [ ] 50 zufällige Erklärungen manuell geprüft, ≥ 95 % korrekt
- [ ] Lighthouse-Performance ≥ 85 auf Mobil
- [ ] Konto-Export und -Löschung funktionieren

## Risiken, Annahmen und offene Fragen

Das größte Risiko sind falsche Erklärungen: Ein Sprachmodell, das Schach „selbst rechnet“, erfindet Varianten. Deshalb verbalisiert das Modell nur Fakten, die Stockfish und die Regel-Logik geliefert haben.

### Risiken

| Risiko | Wahrscheinlichkeit | Auswirkung | Gegenmaßnahme |
| --- | --- | --- | --- |
| Erklärungen sind schachlich falsch | Hoch | Hoch | Modell bekommt nur strukturierte Engine-Fakten (bester Zug, Hauptvariante, Materialbilanz, erkannte Motive); jeder genannte Zug wird mit chess.js geprüft; ungültige Erklärungen werden verworfen; Feedback-Button |
| Maia läuft im Browser zu langsam oder ist zu groß | Mittel | Mittel | Technik-Spike in Phase 0; Fallback: Maia auf einem kleinen Server oder Stockfish mit menschlichem Fehlermodell |
| Engine ist auf dem Handy zu langsam | Mittel | Mittel | Lite-Variante, begrenzte Tiefe, Lichess Cloud-Eval als Abkürzung; Analyse läuft im Hintergrund weiter |
| Lektionsinhalte dauern länger als geplant | Hoch | Mittel | Launch mit Stufe 0 und den ersten drei Kursen von Stufe 1; Entwürfe mit Sprachmodell, Lösungen per Engine geprüft, manuelle Durchsicht |
| Sync-Konflikte bei mehreren Geräten | Mittel | Mittel | Versuche und Züge nur anhängen, nie überschreiben; eindeutige IDs pro Aktion; Ratings serverseitig berechnen |
| Motivation sinkt ohne Community | Mittel | Hoch | Tagesziel, Streaks, kurze Einheiten, sichtbarer Fortschritt |
| GPL-Pflichten durch Stockfish/chessground | Sicher | Gering | Quellcode öffentlich stellen, sobald die App anderen zugänglich gemacht wird |
| Änderungen an Lichess-APIs | Gering | Gering | Puzzles liegen in der eigenen Datenbank; Lichess-APIs sind nur optionale Beschleuniger |

### Annahmen

- Der Nutzer trainiert 20–60 Minuten am Tag, vor allem am Desktop, kurze Puzzle-Einheiten am Handy.
- Oberfläche und Lektionen sind auf Deutsch.
- Betriebskosten bleiben im Gratis-Kontingent von Hosting und Datenbank; dazu kommen ca. 3–10 $ im Monat für Erklärungen.
- Ein Entwickler (oder ein KI-gestützter Einzelentwickler) baut die App.

### Offene Fragen

| Frage | Wer klärt | Blockierend |
| --- | --- | --- |
| Geklärt: Der Nutzer steht bei ca. 200 Elo und kennt Regeln und Grundtaktik; die V1-Lektionen decken deshalb Stufe 0 und den Kern von Stufe 1 ab | Auftraggeber | Erledigt |
| Soll die App später auch anderen zugänglich sein? Dann gelten GPL-Pflichten und Datenschutz (DSGVO) voll | Auftraggeber | Ja, für Lizenzwahl |
| Sprachmodell für Erklärungen: Claude Opus 5.5 (Standard) oder das günstigere Claude Haiku 5.5? | Auftraggeber | Nein |
| Lässt sich Maia-2 als ONNX exportieren und auf dem Handy in < 300 ms pro Zug ausführen? | Technik (Spike) | Ja, für Bot-Architektur |
| Welche Rate-Limits und Zugangsregeln gelten aktuell für Lichess Opening Explorer und Cloud-Eval? | Technik | Nein |
| Soll es eigene Bot-Figuren und -Namen geben (Design), statt der Persönlichkeiten von chess.com? (chess.com-Namen und -Bilder dürfen nicht übernommen werden) | Design | Nein |
| Deutsche (S, L, T, D) oder englische Notation als Standard? | Auftraggeber | Nein |
| Mobile-App: Soll sie je in die Stores? Für den Eigengebrauch reichen APK (Android) und Web-App (iPhone) ohne Gebühren; die Stores kosten ca. 99 $ pro Jahr (Apple) bzw. einmalig ca. 25 $ (Google) | Auftraggeber | Nein, erst vor Phase 5 |

## Quellen

Geprüft durch direktes Öffnen der Seite:

- [nmrugg/stockfish.js](https://github.com/nmrugg/stockfish.js) – Stockfish 19, Varianten, Größen, COOP/COEP, GPL-3.0
- [CSSLab/maia2](https://github.com/CSSLab/maia2) – Maia-2, MIT-Lizenz, Python-Paket
- [CSSLab/maia3](https://github.com/CSSLab/maia3) – Maia-3, Modellgrößen, AGPL-3.0
- [CSSLab/maia-platform-frontend](https://github.com/CSSLab/maia-platform-frontend) – Maia im Browser per onnxruntime-web
- [Clariity/react-chessboard](https://github.com/Clariity/react-chessboard) – MIT-Lizenz, Funktionen
- [jhlywa/chess.js](https://github.com/jhlywa/chess.js) – BSD-2-Clause
- [lichess-org/chess-openings](https://github.com/lichess-org/chess-openings) – CC0-1.0, Format
- [lichess-org/database](https://github.com/lichess-org/database) – Exporte von Partien, Puzzles und Bewertungen

Über Suchergebnisse geprüft (die Seiten waren aus der Arbeitsumgebung nicht direkt erreichbar; vor der Umsetzung gegenlesen):

- [Lichess-Datenbank](https://database.lichess.org/) – Anzahl und Spalten der Puzzles
- [Lichess: End of Year Update 2025](https://lichess.org/@/Lichess/blog/lichess-end-of-year-update-2025/YRiNKoaQ) – offene Daten unter CC0
- [chess.com: Zugklassifizierung](https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-move) – Schwellen in erwarteten Punkten
- [chess.com Published-Data API](https://www.chess.com/news/view/published-data-api) – Endpunkte für Partiearchive
- [chess.com Fair Play Policy](https://www.chess.com/legal/fair-play) – Verbot von Analyse-Erweiterungen während der Partie
- [chessground](https://www.npmjs.com/package/chessground) – GPL-3.0
- [Chesscomputer](https://chromeboard.com/extension/chesscomputer-mgbdjmochkcdciojgkgjopgkhbnjhbjp) und [Lichess Analyzer](https://chromeboard.com/extension/lichess-analyzer-fdnpomkdbccglakofideabdlaiabbekb) – bestehende Extensions

Preise der Claude API: Stand der Anthropic-Dokumentation vom 6. Oktober 2026.
