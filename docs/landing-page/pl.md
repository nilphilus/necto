# Necto

## Kolejny request zaczyna się od tej odpowiedzi.

Interfejs OpenAPI dla ASP.NET Core, który łączy wartości z odpowiedzi z requestami, które mogą ich użyć.

Przeglądaj endpointy, wyślij request i przejdź dalej z danymi otrzymanymi w odpowiedzi. Necto pomaga prześledzić przepływ przez API dzięki zapisywanym zestawom parametrów i podpowiedziom wynikającym z kodu C#.

**Zobacz kod** → [GitHub](https://github.com/nilphilus/necto)

**Uruchom przykłady** → [Pierwsze kroki](../../README.md)

## Endpointy są ze sobą powiązane. Ich przeglądanie też powinno być.

Od klienta przechodzisz do urządzenia. Od urządzenia — do faktury. Od faktury — do jej pozycji.

Sprawdzenie takiego przepływu często wymaga skopiowania ID, znalezienia kolejnego endpointu, wklejenia wartości i ponownego uzupełnienia tego samego kontekstu klienta lub tenanta. Relacje istnieją już w API, ale to Ty przenosisz je między requestami.

Necto pokazuje te powiązania w interfejsie API. Po skonfigurowaniu mapowań endpointów podpowiada, gdzie można wykorzystać otrzymane wartości, i pozwala przenieść je do kolejnego requestu.

## Od odpowiedzi do kolejnego requestu

1. **Wyślij request.** Wybierz operację z dokumentu OpenAPI i uzupełnij jej parametry lub body JSON.
2. **Zaznacz obiekt w Preview.** Przeglądaj JSON z kolorowaniem składni i wybierz fakturę lub jej pozycję. Na podstawie mapowań Necto uzupełni odpowiednie pola powiązanych requestów.
3. **Wybierz, zmień lub wpisz wartość.** Powiązane requesty mają edytowalne pola z rozwijanymi podpowiedziami. Możesz zachować zaznaczoną wartość, wyszukać inną lub wpisać własną. Requesty GET i HEAD spełniające warunki można wysłać bezpośrednio, gdy dostępne są wymagane dane.
4. **Prześledź kolejne kroki.** Każdy powiązany request tworzy nowy krok. Nawigacja okruszkowa pozwala wrócić do wcześniejszej odpowiedzi i wybrać inną ścieżkę.

Przykład: pobierz listę faktur, użyj ID faktury do pobrania jej pozycji, a potem ID pozycji do otwarcia jej szczegółów.

## Powiązania wynikające z kodu

OpenAPI opisuje operacje. Necto dodaje podpowiedzi, jak można przekazywać między nimi dane.

Roslyn Source Generator analizuje obsługiwane rejestracje ASP.NET Core Minimal API podczas kompilacji. Dopasowuje pola odpowiedzi do danych wejściowych requestów na podstawie dedykowanych typów identyfikatorów, nazw identyfikatorów lub jawnych kluczy `[EndpointValue("...")]`. Dopasowanie wymaga zgodnych typów CLR.

Generator opisuje również ścieżki przez zagnieżdżone obiekty i tablice odpowiedzi, uwzględniając nazwy pól JSON. Dzięki temu UI rozpoznaje obiekty, które można zaznaczyć, i odczytuje właściwe pole wybranego elementu.

Aplikacja udostępnia wygenerowane mapowania obok dokumentu OpenAPI. Necto UI sprawdza je względem dostępnych operacji, zanim pokaże podpowiedzi. Można też dostarczyć jawne mapowania — tak działa przykład z FastEndpoints.

To sugestie wykorzystania wartości, a nie deklaracja, że po jednym endpoincie zawsze musi nastąpić drugi. Ty decydujesz, który request wysłać.

## Duże odpowiedzi też można przeglądać — strona po stronie

Duża odpowiedź nadal powinna nadawać się do przeglądania. Necto pokazuje tablice i obiekty JSON po 25 elementów na stronę. Możesz przechodzić między stronami lub od razu wpisać numer strony. Zagnieżdżone kontenery od drugiego poziomu są początkowo zwinięte i po rozwinięciu mają własne stronicowanie.

To paginacja podglądu. Nie wymaga obsługi paginacji przez API, nie zmienia odpowiedzi i nie wysyła kolejnego requestu. Zaznaczenie obiektu na dalszej stronie nadal uzupełnia powiązany request wartością z tego konkretnego elementu.

Duży JSON jest parsowany w Web Workerze. Długie stringi i tekst w Raw również są stronicowane, a **Download response** zapisuje całą oryginalną treść niezależnie od wyświetlanej strony.

W jednym teście Chromium w środowisku deweloperskim odpowiedź o wielkości około **117 MB, zawierająca 100 000 rekordów**, otworzyła się w Preview po około **2,2 sekundy**. Podgląd miał **886 elementów DOM** zarówno na pierwszej, jak i ostatniej stronie. To wynik konkretnego pomiaru, nie obietnica dla każdego urządzenia: pełna odpowiedź nadal zajmuje pamięć, a przekazanie sparsowanych danych może na krótko zablokować główny wątek.

## Zachowaj kontekst. Zmieniaj requesty.

Zapisz powtarzające się nagłówki oraz parametry ścieżki i zapytania jako nazwane presety. Połącz preset tenanta z presetem klienta lub urządzenia, a wartości dotyczące konkretnego przepływu ustaw w **Call-flow overrides**.

Presety i nadpisania uzupełniają pasujące pola, gdy przechodzisz do kolejnych operacji. Przeglądarka zapisuje presety lokalnie dla skonfigurowanego adresu dokumentu OpenAPI.

## Co potrafi dzisiaj

- **Przeglądanie OpenAPI.** Wyszukiwanie endpointów, grupowanie według tagów oraz przełączanie nazw operacji i ścieżek.
- **Wysyłanie requestów.** Parametry path, query i header, body JSON oraz podgląd statusu, czasu wykonania i treści odpowiedzi.
- **Przeglądanie i zaznaczanie JSON-a.** Kolorowanie składni i wybór obiektów powiązanych z requestami, również w zagnieżdżonych tablicach.
- **Ponowne użycie danych.** Uzupełnianie pól z zaznaczenia, wybór podpowiedzi lub wpisanie własnej wartości.
- **Stronicowanie dużych payloadów.** Przechodzenie po stronach Preview, przeglądanie fragmentów Raw i pobieranie pełnej odpowiedzi.
- **Nawigacja po łańcuchu requestów.** Powrót do wcześniejszych kroków i sprawdzenie innego wariantu przepływu.
- **Łączenie kontekstu.** Zestawianie nazwanych presetów i nadpisywanie wartości dla konkretnego przepływu.
- **UI razem z API.** Skompilowany frontend jest osadzony w pakiecie .NET i serwowany przez aplikację ASP.NET Core.

## Zacznij od API, które już masz

W aplikacji korzystającej z Necto i ASP.NET Core OpenAPI:

```csharp
using Necto;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapNectoEndpointMappings();
    app.UseNectoUI(endpointMappingsPath: "/necto/endpoint-mappings");
}

// Zarejestruj endpointy ze stałymi operationId przez .WithName(...).

app.Run();
```

Otwórz `/necto/`, aby przeglądać API. Domyślny dokument OpenAPI znajduje się pod `/openapi/v1.json`; adres interfejsu i dokumentu można zmienić.

Repozytorium zawiera przykłady Minimal API i FastEndpoints z przepływami klientów, urządzeń i faktur. Aplikacja używająca spakowanego UI nie wymaga osobnego budowania frontendu; kompilowanie Necto ze źródeł wymaga Node.js i pnpm.

**Przeczytaj instrukcję konfiguracji** → [Necto UI](../../Necto.UI/README.md)

**Poznaj projekt** → [GitHub](https://github.com/nilphilus/necto)
