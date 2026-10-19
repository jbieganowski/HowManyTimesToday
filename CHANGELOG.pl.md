# Changelog

([English version](CHANGELOG.md))

## [1.3.5] - 2026-10-20

### Integracja

- Raport karty o stronie jest podzielony na krótkie linie (po jednej na kartę błędu), bo log
  zachowuje tylko początek każdego raportu.

## [1.3.4] - 2026-10-20

### Integracja

- Karta zgłasza do logu, co pokazuje strona po jej uruchomieniu (teksty ewentualnych kart
  błędu i ile jej własnych kart jest narysowanych), więc urządzenie, które dalej pokazuje
  błąd, można rozpoznać po dokładnym komunikacie.

## [1.3.3] - 2026-10-20

### Integracja

- **Karty błędu tej karty odbudowuje sama karta.** Niektóre klienty (aplikacja Home Assistant
  na telefonie) uruchamiały kartę poprawnie, a mimo to na pulpicie zostawały karty „Custom element
  doesn't exist” zbudowane przed nią. Po zdefiniowaniu karta prosi teraz o odbudowanie
  takich kart i zgłasza w logu, ile ich znalazła i co zostało.

## [1.3.2] - 2026-10-20

### Integracja

- **Zdania na karcie są takie same jak w aplikacji na Androida** we wszystkich językach:
  „Jesteś na bieżąco”, „Wszystko zgodnie z planem” (zanikający klawisz, gdy następny termin
  jest jeszcze daleko; „Zbliża się pora” dopiero od 55 % drogi), „TERAZ”, odliczanie
  „Następne za …”, „Ostatnio / łącznie”. Strona pomocy w oknie Konfiguruj cytuje te same zdania.
- **Strona, która trzyma starszą kopię karty, przejmuje nowszą**: karty już pokazane
  rysują się z nowym wyglądem w ciągu sekundy (wcześniej wygrywała pierwsza załadowana
  kopia, a nowsza była ignorowana).
- **Plik karty jest zawsze wysyłany w całości** (nigdy „bez zmian”), a karta zgłasza w
  logu Home Assistanta, że się uruchomiła albo co ją zatrzymało, więc urządzenie pokazujące
  „Custom element doesn't exist” można rozpoznać.

## [1.3.1] - 2026-10-20

### Integracja

- Każde żądanie o plik karty jest zapisywane w logu (nazwa klienta, czy było
  sprawdzeniem aktualności i wynik), więc urządzenie, które pokazuje „Custom element
  doesn't exist”, można rozpoznać: karta nie została w ogóle zażądana albo nie dotarła.

## [1.3.0] - 2026-10-20

### Integracja

- **Kafelek pokazuje to, co karta w aplikacji na Androida**, bez historii: koło z liczbą,
  nazwę, opis, zdanie stanu, notkę o migającej liczbie, odliczanie („za 10h 46m”), „Ostatnio:
  ... · łącznie: n/m” oraz ołówek otwierający okno edycji. Gdy termin jest właśnie teraz
  (czerwony), następny nie jest zapowiadany, tak jak w aplikacji.

## [1.2.0] - 2026-10-20

### Integracja

- **Edycja harmonogramu z kafelka.** Podwójne dotknięcie lub podwójne kliknięcie kafelka
  (albo Alt+Enter) otwiera okno z polami harmonogramu (nazwa, opis, włączenie/wyłączenie,
  godziny lub interwał, start, koniec, okno tolerancji) i przyciskami **Zapisz zmiany
  harmonogramu**, **Resetuj do „wszystko o czasie”** oraz **Zamknij**. Pojedyncze dotknięcie
  nadal naciska klawisz, ale po krótkiej chwili (około jednej trzeciej sekundy), żeby
  podwójne dotknięcie nie nacisnęło dwa razy.
- **Resetuj do „wszystko o czasie” także w edytorze karty**, pod przyciskiem zapisu.

## [1.1.2] - 2026-10-19

### Integracja

- **Poprawka:** aplikacja lub przeglądarka, która trzymała skrypt karty w pamięci podręcznej
  pod jego adresem (aplikacja Home Assistant na telefonie po aktualizacji dalej pokazywała
  „Custom element doesn't exist”), pobiera go teraz od nowa: adres karty zawiera wersję
  integracji (`...card.js?v=1.1.2`), zarówno jako dodatkowy moduł, jak i zasób pulpitu,
  który sam aktualizuje się przy każdej nowej wersji.

## [1.1.1] - 2026-10-18

### Integracja

- **Poprawka:** na mocno obciążonym pulpicie karty czasem pokazywały „Custom element doesn't
  exist” aż do następnego odświeżenia. Karta jest teraz rejestrowana także jako zasób
  pulpitu (Ustawienia → Pulpity → Zasoby, dodawany przy starcie, usuwany razem z
  integracją), tak jak ładują się inne karty niestandardowe; droga przez dodatkowy moduł
  zostaje.

## [1.1.0] - 2026-10-18

### Integracja

- **Wygląd „kafelek” karty.** `layout: tile` (albo pole **Wygląd** w edytorze karty) pokazuje
  harmonogram jako zwarty kafelek: kolorowe kółko z liczbą, nazwa i zdanie stanu. Dotknięcie
  naciska klawisz; długie przytrzymanie (albo prawy klik, albo Shift+Enter) otwiera historię.
  Domyślnie zostaje duża karta, więc istniejące karty wyglądają tak samo.
- **Dodanie integracji nie wymaga okna:** wybranie jej w **Dodaj integrację** tworzy ją od
  razu; harmonogramy dodaje się potem przyciskiem **Konfiguruj**.
- **Opcjonalna linia YAML:** samo `how_many_times_today:` w `configuration.yaml` dodaje
  integrację automatycznie przy następnym starcie (raz; linię można zostawić lub usunąć).
- Elementy karty rejestrują się tylko raz, nawet gdy skrypt załaduje się dwa razy.

## [1.0.1] - 2026-10-18

### Integracja

- **Poprawka:** przy świeżej instalacji sensory dostawały identyfikator z prefiksem nazwy
  urządzenia (`sensor.how_many_times_today_lek_na_serce`); znów jest to `sensor.lek_na_serce`.
- **Poprawka:** usunięcie integracji usuwa teraz także zapisany stan i historię naciśnięć,
  zamiast zostawiać pliki w `.storage`.

## [1.0.0] - 2026-10-18

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
- **Usługi encji** `press_schedule`, `clear_history`, `set_schedule_active`, `reset_schedule` i `update_schedule` (zmienia nazwę, opis, godziny lub interwał, start, koniec i okno tolerancji harmonogramu; postęp zostaje); naciśnięcie,
  które wymaga odpowiedzi, kończy się błędem walidacji z kluczem tłumaczenia
  `answer_required`.
- **Wersja i autor** (SemVer, widoczne na stronie urządzenia, w oknie dodawania i na górze menu Konfiguruj).
- **Reset do „wszystko na czas”** w oknie Konfiguruj (i usługa `reset_schedule`): wybrane harmonogramy dostają dzisiejszy licznik i historię tak, jakby każdy już przypadły termin zrobiono na czas.
- **Edycja harmonogramu w edytorze karty:** nazwa, opis, godziny lub interwał, start, koniec i okno tolerancji.
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
