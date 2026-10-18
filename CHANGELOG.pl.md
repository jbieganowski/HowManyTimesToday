# Changelog

([English version](CHANGELOG.md))

## [Unreleased]

### Integracja

- **Harmonogramy zamiast slotów.** Dowolna liczba harmonogramów; każdy ma jeden klawisz,
  jeden sensor i licznik dzisiejszych wykonań.
  - Tryby: stałe godziny (1–24 na dobę) albo co X godzin (pierwszy termin to dokładnie
    start).
  - Start i opcjonalny koniec (data i godzina), ręczne wyłączenie; okno tolerancji
    (domyślnie 30 minut przed i po terminie, per harmonogram); opcjonalny opis.
  - Cykl kolorów: zielony → przejście w czerwony → czerwony w terminie → miganie na
    brązowo po oknie; termin, którego nikt nie zamknął, trafia do logu jako POMINIĘTE po ¾
    odstępu do następnego.
  - Naciśnięcie poza oknem przy otwartym terminie zadaje pytanie A/B/C (`already_done`,
    `do_now`, `extra`); naciśnięcia bez otwartego terminu zapisują się jako „poza
    harmonogramem”, a liczba miga; więcej wykonań niż zaplanowano robi klawisz czerwonym z
    czarną liczbą.
  - Stan sensora jest jedynym źródłem prawdy o wyglądzie (`pending`, `green`, `transition`,
    `red`, `blinking_brown`, `exceeded`, `inactive`).
- **Powiadomienia:** co do sekundy w chwili, gdy termin przypada, odpalane jest zdarzenie
  `how_many_times_today_due` (po tym, jak encja przyjęła nowy stan), karta pokazuje
  komunikat w aplikacji, a opcjonalny push idzie przez aplikację mobilną.
- **Usługi encji** `press_schedule`, `clear_history`, `set_schedule_active`; naciśnięcie,
  które wymaga odpowiedzi, kończy się błędem walidacji z kluczem tłumaczenia
  `answer_required`.
- **Stan przeżywa restarty**; dzisiejszy licznik wynika z historii i zeruje się o północy.
  Terminy i daty podążają za strefą czasową Home Assistanta.
- **Migracja** z poprzedniego modelu zadań i slotów (wersja wpisu 1 → 2): zadania stają się
  harmonogramami ze swoimi identyfikatorami, historia naciśnięć i ostatnie naciśnięcia
  zostają, stare encje są usuwane.
- Strona pomocy w menu Konfiguruj, **Jak czytać kartę?**: co znaczy każdy kolor i zdanie na
  klawiszu, prostymi słowami i w języku oglądającego (cytuje kartę dokładnie).
- Config Flow i Options Flow z prawdziwymi krokami w UI (licznik liczby wykonań, osobne pole
  godziny na wykonanie), walidacja godzin; siedem języków (en, pl, de, ru, uk, zh-Hans),
  w języku zalogowanego użytkownika Home Assistanta.

### Karta Lovelace

- Proste zdanie o każdym stanie pod nazwą (karta nie polega samym kolorem) oraz uwaga, gdy
  liczba miga.
- Jeden klawisz na harmonogram z dużą liczbą, opisem pod spodem i historią z pogrubionym
  przedrostkiem „POZA HARMONOGRAMEM”; okno pytania A/B/C; komunikat w aplikacji i dźwięk;
  edytor wizualny z selektorem encji ograniczonym do sensorów tej integracji. Dołączona do
  integracji i rejestrowana automatycznie; jest serwowana z ETag i `no-cache`, więc zmieniona
  karta działa od następnego wczytania strony bez restartu Home Assistanta.

### Jakość i dokumentacja

- 118 testów jednostkowych (silnik, koordynator i magazyny, dane wejściowe i tłumaczenia)
  działających bez instalacji Home Assistanta, w CI razem z walidacją hassfest / HACS.
- Dwujęzyczne (angielski + polski) README, specyfikacja, przewodnik konfiguracji z
  prawdziwymi zrzutami UI, uwagi o testowaniu oraz generowane diagramy (SVG, z kopiami PNG).
