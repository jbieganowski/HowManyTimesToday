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
- Brakuje jeszcze: karty Lovelace (frontend), pozostałych języków dopasowanych do Buy The Way, testów jednostkowych, walidacji HACS/hassfest
