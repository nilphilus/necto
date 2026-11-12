---
name: publish-necto-nuget
description: Przygotowuje i publikuje paczkę NuGet Necto jako plik do pobrania w GitHub Releases repozytorium nilphilus/necto. Użyj przy prośbach o wydanie Necto, spakowanie NuGeta do wydania lub dołączenie paczki do istniejącego wydania.
---

# Wydanie NuGet Necto na GitHubie

Domyślnym miejscem publikacji jest sekcja **Releases** repozytorium `nilphilus/necto`, gdzie `.nupkg` jest załącznikiem do wydania. Prośbę o rejestr z adresem do `dotnet restore` obsłuż jako publikację w GitHub Packages, korzystając z dokumentacji rejestru. [GitHub Packages dla NuGet](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-nuget-registry)

## Przygotowanie paczki

1. Sprawdź `git status --short`, adres `origin`, ostatnie tagi i wydania. Ustal wersję NuGet i commit z polecenia użytkownika lub z jednoznacznego kontekstu wydania. Zachowaj istniejącą konwencję tagów, a przy jej braku użyj `v<wersja>`. Jeśli wersji lub commita nie da się ustalić, przygotuj dostępne informacje i poproś o brakującą decyzję.
2. Przy publikacji buduj z czystego checkoutu commita, który ma wskazywać tag. Jeśli robocze drzewo zawiera zmiany, użyj osobnego checkoutu i zostaw bieżące zmiany użytkownika. Commit musi być dostępny w docelowym repozytorium przed utworzeniem wydania dla jego SHA.
3. Użyj SDK .NET 10, Node.js i pnpm. Projekt `Necto/Necto.csproj` buduje i osadza Vue UI oraz pakuje generator Roslyn jako analizator. Z katalogu głównego checkoutu uruchom poniższe polecenia, podstawiając `$version` oraz `$output` wskazujący nowy katalog pod `artifacts/`. Sprawdź kod wyjścia po każdym poleceniu.

   ```powershell
   dotnet test Tests/Tests.csproj -c Release
   dotnet pack Necto/Necto.csproj -c Release -p:PackageVersion=$version -o $output
   ```

4. Otwórz `.nupkg` jako ZIP. Sprawdź identyfikator `Necto` i wersję w `.nuspec`, a także `lib/net10.0/Necto.dll`, `analyzers/dotnet/cs/Necto.Generator.dll` i `README.md`. Zasoby `Necto.UI/index.html` i `Necto.UI/assets/*` sprawdź w manifeście `Necto.dll`. Zapisz ścieżkę i SHA-256 paczki. Przy prośbie o samo przygotowanie zwróć te dane i wyniki testów.

## Publikacja i weryfikacja

Publikuj po otrzymaniu polecenia publikacji. Sprawdź stan zdalnego taga i wydania przed zmianą. Jeśli tag wskazuje inny commit, ustal rozbieżność przed publikacją. Gdy nie ma jeszcze wydania, użyj uwierzytelnionego `gh` i jawnie wskaż repozytorium. Dla istniejącego zdalnego taga użyj `--verify-tag` w miejsce `--target $commit`. Wersję z sufiksem przedpremierowym oznacz `--prerelease`.

```powershell
gh release create $tag $package --repo nilphilus/necto --target $commit --title $tag --notes-file $notesFile
```

W `$notesFile` opisz zmiany dla odbiorców na podstawie historii wydania. Przy istniejącym wydaniu użyj `gh release upload $tag $package --repo nilphilus/necto` tylko wtedy, gdy brakuje załącznika. Przy ponowieniu po błędzie odczytaj stan wydania. Jeśli załącznik już istnieje, pobierz go i porównaj SHA-256. Identyczna paczka spełnia warunek publikacji, a przy różnych sumach zgłoś kolizję. [GitHub CLI](https://cli.github.com/manual/gh_release_create)

Jeśli `gh` jest niedostępny, użyj połączonego narzędzia GitHub lub interfejsu Releases, o ile pozwala przesłać lokalny plik i wybrać właściwy tag. Sprawdź na GitHubie, że wydanie ma oczekiwany status i tag, a pobrany załącznik ma tę samą sumę SHA-256 co lokalny plik. Zwróć link do wydania i do paczki.
