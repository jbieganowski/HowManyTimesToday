# Specyfikacja funkcjonalna — How Many Times Today

([wersja angielska](SPECIFICATION.md))

Stan: ustalone w rozmowie 2026-10-12, implementacja w toku (zobacz [CHANGELOG](../CHANGELOG.pl.md)).

## Architektura

- **Custom Integration** (`custom_components/how_many_times_today/`) — backend:
  harmonogramy, liczniki, historia, encje HA. Konfiguracja przez Config Flow
  (kreator w UI, bez edycji YAML).
- **Custom Lovelace Card** (`www/`) — frontend: przycisk z gradientem kolorów,
  miganiem, odliczaniem.
- Instalacja docelowo przez **HACS** (jeden klik, bez ręcznych skryptów).

## Model danych — zadanie i sloty

Każde zdefiniowane zadanie (np. "Tabletka na serce", "Karma dla kota") ma:

- Nazwę / typ pomiaru (dowolny tekst)
- Harmonogram — jeden z dwóch trybów:
  - **Stałe godziny** (np. 9:00 i 22:00), w pełni edytowalne, nie muszą być
    równo rozłożone w czasie
  - **Interwał** (np. co 12h od ostatniego naciśnięcia)

**Każde oczekiwane wystąpienie w ciągu dnia to osobny, niezależny slot** —
własny przycisk, stan, licznik i historia. Zadanie z 3 wystąpieniami dziennie
to 3 sloty.

## Obsługa spóźnień (tryb interwałowy)

Jeśli naciśnięto później niż oczekiwano (np. interwał 12h, spóźnienie 1h):

- domyślnie: następny odliczany czas skrócony proporcjonalnie (11h zamiast 12h)
- alternatywnie: pełny reset do 12h od faktycznego naciśnięcia
- wybór: zmiana **jednorazowa** albo **trwałe przesunięcie** harmonogramu

## Zachowanie wizualne przycisku

Sekwencja stanów od momentu potwierdzenia:

1. Zielony (świeżo potwierdzone)
2. Stopniowe przejście w stronę czerwonego w miarę zbliżania się terminu
3. Brązowy po przekroczeniu terminu
4. Migający po przekroczeniu **konfigurowalnego progu** (skrajne opóźnienie)

Dodatkowo:

- Dźwięk powiadomienia — **jeden, globalny** wybór dla całego pluginu (lista do
  wyboru w ustawieniach)
- Licznik czasu do następnego oczekiwanego naciśnięcia, aktywny od razu po
  kliknięciu
- Po naciśnięciu: reset slotu + widoczna informacja "ostatnio wzięto o [godzina]"

## Historia

- Log naciśnięć per slot (co, kiedy)
- Czyszczenie: całość albo wybiórczo po tygodniach (wybór konkretnych tygodni,
  nie tylko "ostatnie N tygodni")

## Wielojęzyczność

- Zestaw języków **dokładnie dopasowany do Buy The Way**
- Brakujący język → fallback na angielski
- Standing zasada międzyproduktowa: wersje językowe Buy The Way i tego pluginu
  mają się zawsze pokrywać

## Integracja z Buy The Way (przyszłość)

- Obecnie: wyszarzona, nieaktywna pozycja "Synchronizacja z Buy The Way" w
  opcjach (placeholder pod przyszły backend)
- Gdy funkcja zostanie wdrożona: ma być możliwa do wyłączenia w menu (opcjonalna,
  nie wymuszona)

## Otwarte / do doprecyzowania podczas implementacji

- Dokładny próg (wartość domyślna i jednostka) uruchamiający miganie
- Szczegóły UI Config Flow dla definiowania slotów o niestandardowych godzinach
  (np. 9:00 i 22:00 zamiast równych 12h)
