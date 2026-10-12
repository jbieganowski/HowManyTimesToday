# Changelog

([English version](CHANGELOG.md))

## [Unreleased]

- Szkielet repozytorium, specyfikacja funkcjonalna, licencja MIT
- Dwujęzyczny README/CHANGELOG/specyfikacja (angielski + polski) i wygenerowany baner SVG projektu
- `icon.png` / `logo.png` (+ @2x) w katalogu głównym repo pod HACS/brands
- Silnik integracji (`custom_components/how_many_times_today/`):
  - model harmonogramu (stałe godziny / interwał, polityka spóźnień compress/reset)
  - trwała historia naciśnięć (per slot, czyszczenie całościowe i po tygodniach ISO)
  - coordinator wyliczający etap koloru (zielony → przejście → czerwony → brązowy → migający) i odliczanie
  - Config Flow + Options Flow (dodawanie/edycja/usuwanie zadań, ustawienia globalne: dźwięk, próg migania, wyłącznik synchronizacji z Buy The Way jako placeholder)
  - encje `button` (potwierdzenie) i `sensor` (stan + atrybuty dla karty) per slot
  - usługi `press_slot`, `clear_history`
  - tłumaczenia: en (źródło), pl
- Karta Lovelace (`how-many-times-today-card.js`): przycisk z gradientem koloru w czasie, odliczanie na żywo, historia naciśnięć z czyszczeniem po tygodniach, syntetyzowane dźwięki alarmowe (bez potrzeby plików audio) — dołączona wewnątrz pakietu integracji i rejestrowana/wstrzykiwana automatycznie przez backend, bez ręcznego dodawania zasobu Lovelace
- Poprawiony baner projektu: rozdzielony na osobne wersje EN/PL SVG (pierwsza wersja mieszała oba języki w jednym obrazku i wychodziła poza prawą krawędź) + wygenerowana ikona/logo pod HACS/brands
- Pełna zgodność językowa z potwierdzonym zestawem 7 języków Buy The Way: dodano tłumaczenia backendu `de`, `ru`, `uk`, `zh-Hans` (`en` już pokrywa oba warianty angielskiego z punktu widzenia Home Assistant) oraz zlokalizowano własne statyczne teksty karty Lovelace we wszystkich tych językach, z fallbackiem na angielski
- Dodano do README ilustracje poglądowe stanów kolorystycznych karty i menu Options Flow (EN + PL) — wygenerowane na bazie faktycznych wartości kolorów/layoutu, wyraźnie oznaczone jako mockupy, nie prawdziwe zrzuty ekranu (brak jeszcze automatyzacji przeglądarki do przechwycenia działającego UI HA)
- Postawiona trwała lokalna testowa instancja w Dockerze (`hmtt-test-ha`, `docs/TESTING.md`) i pierwsze realne testy integracji end-to-end — znalezione i naprawione dwa prawdziwe błędy:
  - `_parse_hhmm` wywalał się na formacie `HH:MM:SS` zwracanym przez selektor godziny HA, co psuło każde zadanie w trybie interwałowym i każdą edycję godziny przez UI
  - brak adnotacji `@callback` na handlerach dynamicznego dodawania/usuwania encji w `button.py`/`sensor.py` powodował, że HA uruchamiał je w wątku roboczym zamiast w pętli zdarzeń — dodanie/usunięcie zadania w trakcie działania HA po cichu nie tworzyło/nie usuwało encji (działało tylko po pełnym restarcie z już zapisanej konfiguracji)
- Brakuje jeszcze: testów jednostkowych, walidacji HACS/hassfest, wizualnego edytora karty/opcji, prawdziwych zrzutów ekranu (teraz, mając żywą instancję testową, to odblokowane na kolejny etap)
