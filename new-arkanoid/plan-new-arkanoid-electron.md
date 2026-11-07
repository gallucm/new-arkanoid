# Plan NEW Arkanoid — Remake Electron (TypeScript + Vite + Phaser + React)

> **Nombre interno:** `plan-new-arkanoid-electron.md` — no es el plan de refactor C++ (`plan-refactor-arkanoid.md`). Describe el **remake desde 0** como app de escritorio moderna, manteniendo paridad funcional con el juego actual.
> **Estado legible:** borrador de decisión. Nada está declarado como implementado. El stack recomendado abajo ya fue validado con **mr-frontend**.

---

## 1. Resumen ejecutivo

**Qué es hoy:** `Arkanoid (C++ / SDL 1.2 / ADN-X)` — juego legacy de 2015 ("ARKANOID BETA 0.8", facultad, Code::Blocks + MinGW + SDL 1.2 + motor didáctico **ADN-X** de Avis Software, GPL v3), hoy compilable y jugable en Windows x64 y Linux x86_64 con CMake + Ninja. Ver `README.md`, `CMakeLists.txt`, `docs/hygiene.md`.

**Qué proponemos:** rehacer el mismo juego desde 0 en **TypeScript + Vite + Phaser 3.90+**, con **React 19 solo como `shell`** (menús/settings/high-scores accesibles) y **Electron** para desktop (Windows NSIS + Linux AppImage/deb). Estado global con Zustand, persistencia offline con `localStorage` en web y `electron-store` por IPC en desktop. Se preservan los assets clásicos (logo, fondos, ladrillos, audio normalizado a 48 kHz) y la paridad funcional (Intro → Menu → Level → HighScores → Exit, 72 ladrillos, 3 vidas, multiball, top-10).

**Por qué:** el stack actual (`SDL 1.2 + sdl12-compat` en Linux) obliga a parches de compatibilidad, la distribución necesita DLLs MSYS2 y el mantenimiento cross-platform es frágil. Vite+Phaser+Electron da build reproducible, packaging maduro, audio WebAudio sin resampleo de SDL, y DX para iteración rápida, manteniendo 60 FPS con presupuesto de 16.6 ms.

---

## 2. Análisis funcional completo del proyecto actual (fuente de verdad para el remake)

### 2.1 Stack y build

| Aspecto | Actual |
|---|---|
| Lenguaje | C++17 (`CMAKE_CXX_STANDARD 17`, `-Wall -Wextra`, 0 warnings tras Fase 2) |
| Gráficos/sonido | SDL 1.2 + SDL_image + SDL_ttf + SDL_mixer sobre motor propio **ADN-X** (`engine/`) |
| Plataformas soportadas | **Windows x64 (MSYS2 MINGW64)** y **Linux x86_64** (GCC). Guardas en `CMakeLists.txt:4-30`: `FATAL_ERROR` si no es Windows/Linux, si compiler no es GNU, si no es 64-bit; en Windows exige `MINGW` y tupla `x86_64-w64-mingw32` |
| Detección SDL | `find_path/find_library` con `SDL_ROOT` (default: padre de `CMAKE_CXX_COMPILER`); en Linux busca `lib/x86_64-linux-gnu`, `lib64`... |
| Link | Windows: `mingw32 + SDLmain`; Linux: `SDLmain` si existe, si no `SDL_MAIN_HANDLED` (evita redefinición `main → SDL_main` de `SDL_main.h`) |
| Wrappers | `compilar_y_ejecutar.bat` (Windows, `build-windows/`) y `compilar_y_ejecutar.sh` (Linux, `build-linux/`). Ambos configuran `Ninja Release`, compilan en paralelo, corren el juego y propagan el código de salida. Preservan caché incompatible (`-relocated-N`) y soportan paths con espacios |
| Tests opcionales | `-DBUILD_TESTING=ON` + CTest: `scenes.manager`, `ranking.collision`, `hygiene.resources`, `hygiene.flows` (ver §2.8) |
| Estado audio (post-fix) | `engine/AudioSystem.cpp:48kHz/512, driver pulse, reuse guard + log de negociación`. `Game::run` ahora pacea a 60 Hz (pacing 16 ms) en vez de `SDL_Delay(1)` |

### 2.2 Arquitectura C++ (mapeo para reutilizar en TS)

```
Game (Game::run, FixedStepAccumulator + pacing 60 Hz)
  └─ SceneManager (factories, request/activate/dispatch, quit latch)
       ├─ IntroScene      (start.wav, logo)
       ├─ MenuScene       (START/RANK/EXIT, high-score label)
       ├─ LevelScene      (núcleo gameplay, 781 LOC — god-class)
       ├─ HighScoresScene (top-10, NO SCORES YET)
       └─ ExitScene       (requestQuit)
Entities: Ball, Paddle, Brick, PowerUp, Wall, Player (header-only: score/lives)
Systems: CollisionSystem (swept AABB), Collision (bounce padyel), ScoreBoard, LevelLoader, Config
Engine (ADN-X): VideoMode, Screen, Sprite, Image, TextRenderer, AudioSystem, Music, SoundEffect, Timer, Random, EventQueue, Logger, ErrorState, Point
UI: ImageSprite (presentación)
```

- **Game** (`src/app/Game.cpp`): `init()` crea `VideoMode (800×600×16)` + `Screen` + registra 5 factories e inicia en `Intro`. `run()` despacha eventos → `update(dt)` (fixed-step 1/60) → `render()`, con pacing a 60 Hz y manejo sticky de `SDL_QUIT`.
- **SceneManager** (`src/app/SceneManager.cpp`): `registerScene(id, factory)`, `request(id)` marca `pending_`, `activatePending()` crea la escena, le pone servicios y llama `init()` **después** del callback para no destruirla en uso. `dispatch(eventType, cb)` aplica transición post-callback.
- **FixedStepAccumulator** (`src/app/FixedStepAccumulator.h`): `step = 1/60`, `maxFrameDelta = 0.25`, `maxCatchUpSteps = 8`; si se excede, descarta resto (anti-espiral).
- **Config** (`src/systems/Config.h`): `800×600`, grilla `6×12`, `kFixedStepSeconds = 1/60`, `kBallSpeed = 120 px/s` (legacy 2 px/frame).
- **Geometry** (`src/systems/Geometry.h`): `Vec2/Rect` POD, sin SDL → testeable sin ventana.
- **CollisionSystem** (`src/systems/CollisionSystem.cpp`): `sweep(moving, displacement, target)` AABB barrido (slab method) + `overlaps`. Devuelve `SweepHit {hit, time, normal}`. Evita tunneling a 6000 px/s (probado en `tests/score_collision_tests.cpp`).
- **Collision** (`src/systems/Collision.cpp`): `bounceOffPaddle` con **7 direcciones** según offset (-300..300 dx, -300..-425 dy) y `bounceOffRect` por penetración mínima. Sin “giro vertical directo” en centro.
- **ScoreBoard** (`src/systems/ScoreBoard.cpp`): top-10, formato `ARKANOID-SCORES 1\ndate\tname\tscore` TSV versionado, sort estable, sanitize `A-Z/0-9 _-` (max 8, min 3), guardado atómico `.tmp` + reemplazo Windows (`MoveFileEx`) / Linux (`fs::rename`). Ruta: `%APPDATA%\Arkanoid\scores.txt` (Win) o `$XDG_DATA_HOME/arkanoid/scores.txt` o `~/.local/share/arkanoid/scores.txt` (Linux), override `ARKANOID_SCORES_PATH`.
- **LevelLoader** (`src/systems/LevelLoader.cpp`): parsea `name=`, `background=`, `rows:` con validación estricta (12 columnas, `B/R/Y/G/P/.`). Hoy existe pero **no está cableado** en `LevelScene` (ver §2.4) — oportunidad del remake.

### 2.3 Flujo de juego (GDD breve)

```
Intro (start.wav 210s, PRESS ENTER) --Enter--> Menu (HIGH SCORE label, START/RANK/EXIT)
  Menu --Up/Down+Enter--> Level | HighScores | Exit
  Level: paleta movible, pelota pegada, Space lanza, 72 ladrillos (2×Azul,2×Rojo,2×Amarillo 50×18 en origen (7,100))
         +2 pts/ladrillo, -3 pts/vida, 3 vidas, multiball al tocar PowerUp en (5,2), LEVEL CLEARED/GAME OVER
          → si califica top-10: NameEntry modal (3-8 chars A-Z/0-9, Enter/Escape) → SAVE/SKIP → AwaitContinue → Menu
  HighScores: lista top-10 o NO SCORES YET, Enter/Esc → Menu
  Exit / SDL_QUIT: requestQuit limpio (sin exit() destructivo)
```

- **Controles:** `Enter` avanzar/seleccionar, `Esc` salir, `Up/Down` menú, `Left/Right` paleta, `Space` lanzar. Solo teclado; sin mouse/gamepad. Sin pausa. Sin remap.
- **Física/físicas C++ actuales:** `Paddle dirX = ±120 px/s`, pelota `±300 px/s` por eje (magnitud ≈424 px/s diagonal), rebote paddle por 7 ángulos, swept en pelota principal vs ladrillos/paredes/paleta, callbacks legacy `getContact` para bonus balls/paredes inferiores (doble sistema), 1 ladrillo/frame como máximo en la pelota principal (`break`).
- **Audio:** `IntroScene → start.wav` (Music loop 1), `MenuScene → level.wav`, `LevelScene → brick_bounce.wav / bounce.wav / life_lost.wav / selection.wav` como **Music (streaming, `Mix_LoadMUS`)** + `bonus.wav` como **SoundEffect (chunk, `Mix_LoadWAV`)**. Confusión Music≠SFX.
- **Persistencia:** al terminar (victoria/game-over con score>0 y top-10) se pide nombre y se guarda; al volver al menú se recarga `HIGH SCORE: N`.
- **Ventana/cierre:** `SDL_QUIT` lacheado, `VideoMode 800x600x16 DEFAULT`, cierre limpio.

### 2.4 Niveles y contenido

- **Level data-driven parcial:** `assets/levels/level_01.txt` (metadata + `BBBB...` 6×12) existe y `LevelLoader` lo valida, pero `LevelScene::init` ignora el archivo y hardcodea `f==0..5 → blue/blue/red/red/yellow/yellow` con `50×18` en `(7,100)`. Hay `level_2.jpg` (600×600) y `level_3.png` (600×600) sin `level_02/03.txt`.
- **Ladrillos:** `Brick[6][12]`, `hitPoints=2` (no es HP arcade real; cualquier impacto lo pone a 0 salvo `smalltalk`).
- **Fondos:** `level_1.jpg` 800×600 (costa/atardecer en caverna, contraste azulado) usado como fondo + `intro.png/menu.png/game_over.png` 800×600 + `level_select.jpg`. Ladrillos/Paleta/Pelota/Lives son `50×18`/`80×16`/`18×15`/`40×8` (≈480 KB total imágenes).
- **Fuentes:** `fixedsys.ttf` (27K, HUD/menu), `free_mono.ttf` (571K, ranking). Texto rasterizado por frame con `TextRenderer` (TTL).
- **HUD:** logo arriba derecha, `SCORE 0`, `LIFES` con 3 íconos `40×8`, `LEVEL 1`. Sin minimap, sin pausa, sin hitstop/shake.

### 2.5 Assets — inventario exacto

**Imágenes** (`assets/images/`, 24 archivos, 481 KB):
- Pelota: `ball.png 18×15, 453B` — un solo frame, rebote por flip y escala.
- Paleta: `paddle.png 80×16 RGBA, 4.6K`.
- Ladrillos: `blue/red/yellow/green/pink.png 50×18 JPEG ~1.7-1.9K` + `*_broken.png 50×18 RGBA ~5.1K` (usados solo para estados, actualmente no se usan `green/pink`).
- Paredes: `horizontal_wall.png 613×15 RGBA 17K`, `vertical_wall.png 10×605 RGBA 11K`.
- UI: `logo.png 174×80`, `lives.png 40×8`, `bonus.png 50×18`.
- Fondos 800×600: `intro.png 32K`, `menu.png 37K`, `game_over.png 3.2K`, `ranking_background.png 3.2K`, `level_select.jpg 13K`, `level_1.jpg 177K`, `level_2.jpg 120K`, `level_3.png 146K`.

**Audio** (`assets/sounds/`, 9 WAVs normalizados a **48 kHz/16-bit** — ver forense):
| Archivo | Canales | Duración | Uso actual |
|---|---|---|---|
| `start.wav` | 1 mono | 210.00 s (20.16 MB!) | Intro (Music, loop 1) |
| `level.wav` | 2 estéreo | 2.81 s | Menu (Music, nunca `play` llamado) |
| `level_up.wav` | 1 | 4.22 s | sin uso |
| `bonus.wav` | 2 | 1.07 s | PowerUp (chunk, canal 2) |
| `bounce.wav` | 2 | 0.86 s | Rebote paddle (Music) |
| `brick_bounce.wav` | 2 | 0.77 s | Ladrillo (Music) |
| `life_lost.wav` | 1 | 1.08 s | Vida perd. (Music) |
| `selection.wav` | 1 | 0.22 s | Lanzar (Music) |
| `laser.wav` | 1 | 0.33 s | sin uso |

**Forense audio (por qué sonaba “lento/pesado” en Linux):**
- Origen: 16k mono 8-bit (`start/life/selection/level_up`) y 96k estéreo 16-bit (`level/brick/bounce/bonus`) y 44.1k mono (`laser`).
- Mixer original 22050 Hz (4096) obligaba a resampleo lineal fraccionario (4.35× y 2.7×) en SDL_mixer + segunda conversión PipeWire/DirectSound → tempo a la deriva. Intermedios 44100 diagnosticaron lo mismo; 48k es único entero para ambos (×3 / ÷2).
- Fixes ya aplicados: mixer **48000 Hz / buffer 512 (≈10.6 ms)** + guard de re-apertura + `SDL_AUDIODRIVER=pulse` + pacing 60 Hz + WAVs normalizados a 48k/16-bit. Log actual: `Sistema de audio iniciado: 48000 Hz, 2 canales, buffer 512, driver pulseaudio`.
- Para el remake: los WAV se reconvierten a **OGG Vorbis** (~30-50% menos) con `ffmpeg` y se renuncia al resampleo en vivo con WebAudio nativo. `start.wav` (20 MB mono) debe recortarse (intro real de 210s es inviable) o comprimirse; incluir en pipeline (ver §7).

**Fuentes** (`assets/fonts/`): 2 TTF sin licencia adicional (GPL del proyecto).

### 2.6 Escenas (detalle técnico)

- **IntroScene** (`IntroScene.cpp`): fondo `intro.png`, `start.wav` loop 1, `Enter` → `stopMusic` + `SceneAction::Menu`. Sin temporizador.
- **MenuScene** (`MenuScene.cpp`): `menu.png`, cursor `ball.png` movible 265→325 px (Start 265, Rank 295, Exit 325), label `HIGH SCORE: N` de `ScoreBoard`. Enter según `button.y` → `Start/HighScores/Exit`. X pelotas no usables.
- **LevelScene** (`LevelScene.cpp/h` god-class 781 LOC): concentra todo — carga `level_1.jpg`, 72 ladrillos hardcodeados, pelota + `bonusBall2/3` (multiball fijo `50×50` en (100,100) y (350,350)), paleta `paddle.png`, power-up `bonus.png` en (355,0) activable al golpear ladrillo (5,2), 4 walls `Sprite*`, HUD, audio 5 sonidos, modal `NameEntry/AwaitContinue`, limpieza `lifeLostUntil` 600 ms. Deuda conocida: doble sistema de colisión (swept en principal, `getContact` legacy en secundarios/paredes/paleta), `askPlayerName/promptAndSaveScore/waitForKey` muertos (~260 LOC), paleta `120 px/s` lenta vs pelota 424, score `+2/-3` solo, power-up muta velocidades con `±120` acumulables, `leftWall/rightWall` chequean `getContact` tras swept (doble flip posible).
- **HighScoresScene**: `free_mono 20`, `board.load` en `init`, render top-10 tabular `(1. NOMBRE SCORE FECHA)` o `NO SCORES YET`. `Enter/Esc → Menu`.
- **ExitScene**: `init/update/render` → `requestQuit` (“cierre limpio”).

### 2.7 Persistencia y rutas

- Sin DB, sin server. Formato texto versionado con `validación estricta` (parseo TSV, `stoi` completo, tolera `\r`, ignora basura). `qualifies()` solo `score>0` y (si lleno) `score > last`. `sanitizeName` uppercase, 3-8 chars, `A-Z0-9 -_`, fallback `AAA`.
- Sin migración para remake: mapear `ARKANOID-SCORES 1` → JSON `scores.v1` con mismo campo `name/score/date`.

### 2.8 Tests y calidad (lo que hay que portar)

- `tests/scene_manager_tests.cpp` (114 LOC): factories/request/quit.
- `tests/score_collision_tests.cpp` (162 LOC): top-10, orden, persistencia, bounce ejes + sweep a 6000 px/s (tunneling), paddle 7 ángulos, LevelLoader validar 6 filas.
- `tests/resource_tests.cpp` + `resource_hooks.*` (186 LOC): 3121/3121 superficies creadas/liberadas, cero fugas inventariadas.
- `tests/game_flow_tests.cpp` (590 LOC): captura BMP, verifica layout de prompts, invariantes físicas, audio hook (`Mix_PlayMusic`), victory/game-over con scores 42 (ABC/DEF), persistencia tras “reinicio”.
- `tests/windows-smoke.ps1`: smoke real con fotos (ver §3).
- `BUILD_TESTING=ON` añade los 4 suites. Sin framework externo (dummy video/audio).

### 2.9 Build / packaging / CI

- `CMakeLists.txt` (222 LOC) + `compilar_y_ejecutar.bat/.sh` (ver §2.1). Sin packaging portable; binario dev depende de DLLs MSYS2 / SDL system.
- `.github/workflows/ci.yml`: Build Windows-only (msys2 MINGW64). No hay Linux CI ni validación de tests en CI (documentado en `docs/hygiene.md`).

### 2.10 Diagnóstico senior (qué se pierde y qué se gana)

**Lo que funciona y hay que preservar:** máquina de escenas con factories y transición post-callback (segura), fixed-step 60 Hz con pacing, colisión swept SDL-free (`CollisionSystem.cpp:30-62`) con 0 tunneling, top-10 versionado con guardado atómico, 0 warnings, harness con contadores de recursos y smoke con capturas.

**Deuda técnica que el remake debe resolver:**
1. `LevelScene` god-class 781 LOC + código muerto (~260 LOC) + doble colisión + 3 `Ball` fijas + 72 cargas de sprites (por color) + audio sin manager + `error.set/if(return)` en cada `init`.
2. Reproducibilidad frágil: SDL 1.2 muerto, headers heterogéneos, `sdl12-compat` en Linux, ` SDL_GetAudioDriverName` (SDL1) vs SDL2, `Logger::freopen("CON")` Windows-only, `system("date")`.
3. Audio percibido pesado/lento en Linux por resampleo + pacing/busy-loop + latencia ALSA (fixes ya aplicados en C++, pero frágiles por dependencia SDL).
4. Contenido raquítico: 1 nivel data-driven sin usar, 2 fondos sin `level_02/03.txt`, 2 sonidos sin uso, 1 power-up fijo, sin pausa/remap/mouse/gamepad, sin i18n/a11y.

---

## 3. Capturas del juego funcionando (evidencia)

Capturas de humo reales tomadas con `tests/windows-smoke.ps1` — están en el repo y se inspeccionaron (no son mocks):

| Escena | Ruta | Qué se ve |
|---|---|---|
| `Intro` | `build-levelscene/window-smoke/intro.png` | Logo `ARKANOID` metal, `PRESS ENTER`, `UTN - JOSE C PAZ`, `© CRISTIAN - EZEQUIEL 2015` |
| `Menu` | `build-levelscene/window-smoke/menu.png` | `HIGH SCORE: 0`, cursor pelotita en START, `START/RANK/EXIT`, footer autor |
| `Level` | `build-levelscene/window-smoke/level.png` | Fondo caverna/costa al atardecer (`level_1.jpg`), grilla 6×12 (azul/rojo/amarillo), HUD `SCORE 0 / LIFES ×3 / LEVEL 1`, logo arriba-derecha, paleta + pelota abajo |
| `Playing` | `build-levelscene/window-smoke/playing.png` | Idem con pelota en vuelo tras `Space` |
| `Level Cleared` | `build-levelscene/window-smoke/level.png` (variante) | `LEVEL CLEARED / YOUR SCORE: 0 / PRESS ENTER` sobre el fondo |
| `Ranking vacío` | `build-levelscene/window-smoke/ranking.png` | `HIGH SCORES / NO SCORES YET / PRESS ENTER` |

> Nota: `playing.png` y `level.png` son de **ventana real SDL** (no dummy). El fondo costero es `assets/levels/level_1.jpg` (177 KB).

---

## 4. Stack recomendado (dictamen de mr-frontend)

### 4.1 Decisión recomendada

| Capa | Elección | Por qué |
|---|---|---|
| Build | **Vite 6/7 + TypeScript estricto** | HMR, bundle por defecto, `tsc -b`, `vite build` |
| Runtime web | **Phaser 3.90+** | Madurez, Arcade Physics, escenas, atlas, audio, `ScaleManager FIT` para 800×600 exacto. ~900KB-1.1MB gzip, aceptable desktop |
| Shell UI | **React 19 (solo shell)** | Menús/settings/high-scores accesibles y testeables en React. Phaser aislado en `<div ref>`; React no re-renderiza por frame |
| Estado | **Zustand vanilla** | Phaser lee con `useGameStore.getState()` sin re-renders; React suscribe con selectores finos |
| Desktop | **Electron + electron-builder** | Packaging Win NSIS + Linux AppImage/deb maduro, `electron-store`, auto-update, IPC familiar. Binario 120-180 MB, RAM alta, irrelevante para este juego |
| Audio | WebAudio nativo de Phaser | No hace falta Tone.js para 9 SFX; WAV→OGG |
| Tests | Vitest (unit) + Playwright (smoke) | Cobertura 70% en `state/systems`, smoke boot/menu/paddle/score |

**Supuesto:** prioridad desktop Win/Linux, web como preview de desarrollo.

### 4.2 Alternativas evaluadas (trade-offs)

| Alternativa | Evalución |
|---|---|
| **Excalibur.js** | DX TS-nativo excelente y ECS limpio, bundle más liviano. Menos ecosistema/tooling que Phaser. No compensa si no hay equipo familiarizado; deuda de aprender API + plugins. |
| **Canvas/Arcade custom** (<50 KB) | 60 fps sobrado para este scope, pero reinventás loop, colisiones swept, escenas, input, audio, escalado y atlas → deuda injustificada. Solo tendría sentido si el objetivo es <50KB web. |
| **Phaser-only (sin React)** | Menos deps, pero menús/formularios y a11y en canvas son un dolor (foco, lectores de pantalla). No recomendado salvo que el shell sea mínimo. |
| **Tauri 2** | Binario 5-15 MB, arranque rápido, seguridad mejor que Electron. Fricción Rust + plugins más chicos. Si el criterio de aceptación es <20 MB, alternativa seria post-MVP. Reutiliza la abstracción `StorageService`/IPC. |
| **Capacitor** | Solo si aparece mobile (no en alcance). Sumaría puente nativo innecesario hoy. |

### 4.3 Audio, persistencia y assets (integración con el actual)

- **Audio:** WebAudio de Phaser. Convertir WAV 48 kHz/16-bit → **OGG Vorbis** (~30-50% menos) con `ffmpeg`, fallback WAV. `start.wav` (20 MB) debe **recortarse** — 210 s no es intro viable; decidir loop de 15-30 s o tema loopable dedicado.
- **High scores:** `StorageService` con interfaz única. Web: `localStorage` clave `arkanoid.scores.v1`. Electron: renderer llama por IPC, `main` persiste con `electron-store` + validación Zod. Top-10 ordenado, offline-first, sin backend.
- **Asset pipeline:** `scripts/optimize-assets.mjs` con `sharp` para atlas único `atlas.png + atlas.json`, `ffmpeg` para audio, subset de TTF. Para pixel retro, **BitmapFont** (más nítido/rápido que TTF en canvas) es la opción por defecto.

---

## 5. Arquitectura propuesta (remake)

### 5.1 Árbol de carpetas (monorepo Vite)

```
arkanoid/
├── electron/
│   ├── main/index.ts        # BrowserWindow 800x600, contextIsolation, sandbox
│   ├── main/ipc.ts          # scores:get/save, settings, updater
│   ├── preload.ts           # contextBridge -> window.arkanoid
│   └── builder.yml
├── src/
│   ├── main.tsx             # React root
│   ├── App.tsx              # shell: PhaserGame + overlays
│   ├── game/
│   │   ├── config.ts        # Phaser.GameConfig, Scale FIT, Arcade
│   │   ├── scenes/          # Boot, Intro, Menu, Level, HighScores, Exit
│   │   ├── entities/        # Paddle, Ball, Brick, PowerUp
│   │   ├── systems/         # Collision, Audio, Input, Score, Particles
│   │   └── data/            # levels.ts (o JSON), config, balance
│   ├── ui/                  # React: Menu, Settings, HighScores, HUD, Dialogs
│   ├── state/ gameStore.ts  # Zustand: score, lives, level, muted, status
│   ├── services/ storage.ts # localStorage | IPC Electron
│   └── assets/ sprites/ audio/ fonts/
├── public/assets/...        # originales + optimizados (ver §7)
├── scripts/optimize-assets.mjs
├── tests/ unit + e2e
└── package.json + vite.config.ts + tsconfig.json + .eslintrc / prettier
```

### 5.2 Mapeo C++ → TS (paridad funcional, sin heredar deuda)

| C++ | Phaser/TS equivalente | Notas |
|---|---|---|
| `Game` + `FixedStepAccumulator` + pacing 16 ms | `Phaser.Game` + `fps.target = 60` + `Scale.FIT` 800×600. Sin `SDL_Delay` manual. | `scene.start('level')` reemplaza `SceneManager::dispatch` post-callback. |
| `SceneManager` factories, `Intro/Menu/Level/HighScores/Exit` | `Phaser.Scene` por nombre, transiciones con events | Scenes aisladas; datos pasan por `registry`/`store`, no por **new** cruzado. |
| `SceneAction None/Menu/Start/HighScores/Exit/Quit` | `type SceneKey = 'intro'|'menu'|'level'|'scores'|'exit'` + `this.scene.start(key, data)` | `Escape` global → `menu`. `SDL_QUIT` → overlay Electron/pagination. |
| `Ball`/`Paddle` (`move(dt)` + `remainder`, `300/-300 px/s`, paleta `±120 px/s`) | `Paddle extends GameObjects.Sprite`, `Ball extends GameObjects.Sprite` con `body.setVelocity` Arcade | **Arcade Physics con `collide` y bola como circle**. Rebote por offset en paleta = ángulo manual de 7 tramos (misma tabla C++). |
| `Brick[6][12]` 50×18 en (7,100) | `BrickGroup` con **StaticGroup** Arcade o pool de 72 imágenes. Atlas compartido, no 72 texturas. | Color por key `blue/red/yellow/green/pink`. HP 1 (no >1 arcade). `hitPoints` solo si se diseña plateado/dorado. |
| `PowerUp` (bonus `bonus.png` en (355,0), 120 px/s, multiball 2 bonus balls) | `PowerUp extends Sprite`, `spawnPowerUp()` con **pool de 3 Balls** (`balls: Ball[]`), velocidad 120 px/s. Drop al golpear ladrillo (tasa configurable, hoy fijo (5,2)). | Migrar a `type PowerUpKind = 'ball'|'expand'|'laser'...` desde el día 1 (ver Fase 3 backlog arcade). |
| `Wall` top/bottom/left/right | **Bounds del mundo Arcade** (`world.setBounds(0,0,800,600)`, `collideWorldBounds`), sin sprites internos. | Eliminar `Wall` sprite = menos draw calls (de 4 a 0). |
| `CollisionSystem::sweep` + `bounceOffRect/bounceOffPaddle` | Arcade `collider(ball, bricks, cb)` + `collideWorldBounds` + `collider(ball, paddle, cb deflection)` | Swept queda innecesario a 300-424 px/s y 60 Hz (≤7 px/frame < 32 px paddle). Tests de tunneling se conservan como de regresión si velocidad >1200 px/s. |
| `ScoreBoard` top-10 `ARKANOID-SCORES 1` TSV | `StorageService` + Zustand: `scores: ScoreEntry[]`, validación Zod, `electron-store` en main / `localStorage` en web. | Reutilizar campo `name/score/date`. Migradorbest-effort del TSV legacy (solo si el usuario lo tiene). |
| `LevelLoader` (`.txt` `B/R/Y/G/P/.`) | `LevelLoader.ts` (validador, lanza `LevelError`) + `levels/level_01.json` generado del `.txt`. | **Cablearlo** desde el día 1 (el C++ lo dejó sin usar). |
| `AudioSystem` 48k/512 + `Music` streaming para SFX | `AudioSystem.ts` con **WebAudio**: `music.play('start', {loop})`, `sfx` con `pool` y `Howler`-opcional. SFX cortos como **chunk** (`bonus/bounce/brick/life/selection`), no streaming. | Básicos: `AudioContext` singleton, `muted` en Zustand, preload en `BootScene`. |
| `TextRenderer` + `fixedsys/free_mono` por frame | **BitmapFont** (pixel retro, `load bitmapFont: 'fixedsys'`) + `TextStyle` para HUD. | Subset de TTF con `fonttools` si se queda TTF. |
| `ErrorState` int codes + `error.set(200)` | Excepciones tipadas (`InitError`) + `Result<T>` en loaders/persistencia. Nunca `exit()` en `update`. | En renderer se capturan en boot e IPC. |
| `Timer` / `Random` / `ImageSprite` | `Phaser.Time` / `Phaser.Math.RND` / atlas + `Sprite` nativo. | Eliminar `Logger::freopen("CON")` y `system("date")`. |

### 5.3 Estado, input, render y audio (detalle Decisión)

- **Zustand vanilla:** `useGameStore.getState()` en Phaser (sin re-render React). React suscribe con selectores finos (`useShallow`). Lo que cambia a 60 fps (posición de paddle/ball) **nunca** entra a Zustand.
- **Input:** `Phaser.Input.Keyboard` + `Pointer`. Flechas/`A-D`, `Space` lanzar/pausa, `Esc` menú, `P` pausa, mouse mueve paddle (`pointer.x`), click/touch relanza. `preventDefault` en flechas/Espacio para no scroll.
- **Render:** `Scale.FIT`, `CENTER_BOTH`, 800×600 interno, `pixelArt: true`, `roundPixels: true`, `fps: 60`, `backgroundColor '#000'`. `TexturePacker` atlas único. Draw calls objetivo: **<30** (fondo + 72 ladrillos + paleta + bola(s) + powerup + HUD). Vuelo: 130 draw calls brutales caen a <30 con atlas + `setVisible`.
- **Audio/WebAudio:** `this.sound` de Phaser + `Volume` global. Música: `start` (loop, fade 300 ms en transición), `level` (menú). SFX pool: `selection` (launch), `bounce` (paddle), `brick` (ladrillo), `life` (vida), `bonus` (powerup). Sin Tone.js.
- **Scenes:** `BootScene` (preload atlas/audio/fonts, `create` → `IntroScene`), `IntroScene` (logo + `PRESS ENTER`, `Enter`), `MenuScene` (React overlay + Phaser fondo), `LevelScene` (núcleo), `ScoresScene`, `ExitScene` (overlay de salida + `window.close()` en Electron).

### 5.4 Integración Phaser+React (sin matar rendimiento)

- `App.tsx` monta Phaser **una sola vez** en `useEffect` con `ref`, `cleanup = game.destroy(true)`. Cuidado con React StrictMode doble-mount en dev (desactivar `StrictMode` para la raíz o idempotencia).
- **Comunicación unidireccional:** Phaser → `store.setState()` / `game.events.emit('hud')` / `window.arkanoid`. React → `store.getState()` o invocar eventos de Phaser. Nada de props por frame.
- Canvas `absolute inset-0`, overlays React `pointer-events-none` salvo menú/settings/name-entry. Re-render React solo en cambios discretos (`status, scores, muted`).
- **Accesibilidad:** menú, settings, high-scores y game-over en **React con botones reales**, foco visible, `aria-live` para score/game-over, `prefers-reduced-motion` desactiva shake/partículas, contraste AA. El canvas nunca es la única vía de info (añadir `role="img" aria-label` al canvas).
- **i18n:** `i18next` solo en shell. Scenes no hardcodean strings; reciben `t()` inyectado desde config, locales `es`/`en` en JSON.

### 5.5 Electron (packaging, IPC seguro, paths)

- **Ventana:** `BrowserWindow 800×600` (min 800×600, `resizable: true`, `titleBarStyle: 'hiddenInset'` en mac opcional), `webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }`.
- **Preload/IPC:** `contextBridge.exposeInMainWorld('arkanoid', { getScores, saveScore, getSettings, checkUpdate })`. Validación Zod en `ipcMain.handle`, nunca dejo renderer tocar `fs` directo.
- **Persistencia:** `electron-store` en `main` (`userData`), migración best-effort del TSV legacy (`ARKANOID-SCORES 1` → `scores.v1`) si el usuario lo tiene. Web usa `localStorage` vía misma `StorageService`.
- **Packaging:** `electron-builder.yml`: `appId: com.arkanoid.app`, `productName: Arkanoid`, `asar: true`, targets `win: nsis x64`, `linux: AppImage + deb x64`, `extraResources: assets` (o `public/` empaquetado). Auto-update con `electron-updater` contra GitHub Releases, chequeo al arrancar, diálogo nativo `quitAndInstall`. App 100% offline.
- **Paths:** dev rutas relativas Vite; prod `process.resourcesPath` / `app.getAppPath()`. Loader Phaser usa rutas relativas desde `BASE_URL`, nunca absolutas de disco. `extraResources` solo para assets gigantes (`start.wav` si se conserva WAV; con OGG ya no hace falta).
- **Binario 120-180 MB:** criterio de aceptación (no bloqueante MVP). Si >50 MB se vuelve requisito, migrar a Tauri reutilizando la abstracción.

---

## 6. Roadmap de migración (fases, DoD, riesgos)

**Fase 0 — Scaffolding Vite+TS+React (0.5 día)**
- `npm create vite@latest` con `react-ts` en carpeta nueva (ej. `arkanoid-new/`), `tsconfig.json` estricto (`strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noFallthroughCasesInSwitch, target ES2022, moduleResolution bundler`), ESLint flat + `typescript-eslint` strict + `react-hooks`, Prettier (`semi: false, singleQuote: true`), `git init`, `.gitignore`, `vite.config.ts` con `base './'` y alias.
- **Hecho cuando:** `npm run dev` sirve, `npm run build` + `preview` funcionan, `tsc --noEmit` 0 errores.

**Fase 1 — Boot + Shell React + Phaser hello (1 día)**
- `App.tsx` monta Phaser en `div ref` con `Phaser.GameConfig (FIT 800×600, Arcade, FPS 60)`, `game.destroy` en cleanup. `BootScene` carga atlas/audio/fonts. `IntroScene` reproduce `intro.png` + `PRESS ENTER` (Enter/click). Store Zustand con `status/score/muted`.
- **Hecho cuando:** Intro renderiza 60 FPS, `Enter` pasa a Menu, sin warnings en consola.

**Fase 2 — Menú + HighScores + Persistencia (1 día)**
- `MenuScene` (fondo `menu.png`, logo, `START/RANK/EXIT` React + Phaser cursor), `ScoresScene` (lista top-10, `NO SCORES YET`), `ExitScene` (overlay). `StorageService` (localStorage + IPC mock), validación Zod, migrador del TSV legacy.
- **Hecho cuando:** navegar con teclado/mouse funciona, top-10 persiste tras reload, `npm run test` Vitest pasa.

**Fase 3 — Level jugable vertical slice (2-3 días)**
- `LevelScene`: `Paddle`, `Ball`, `Brick[6][12]` (`StaticGroup`), `PowerUp` (bonus → 2 extra balls = 3 total, vida solo al caer la última), `LevelLoader` cargando `level_01.json`, colisiones Arcade, paddle deflection 7 ángulos, HUD React vía store, `Level Cleared / Game Over` + `NameEntry` modal React (3-8 A-Z/0-9, Enter/Esc). Fixed-step Phaser `timeScale` solo para test.
- **Hecho cuando:** loop completo `Intro→Menu→Level→Rank` a 60 FPS sin `any`, tests Vitest de colisiones/score/niveles, Playwright smoke (boot, menú, paddle, score).

**Fase 4 — Audio + Feedback (1 día)**
- Convertir WAV → OGG (`ffmpeg -ar 48000 -ac 2`), `AudioSystem` WebAudio (música loop con fade, SFX pool), `muted` en settings, `prefers-reduced-motion` (shake/partículas). `start.wav` recortado a loop usable (ver §7).
- **Hecho cuando:** sin underruns, música a 48k nativa en ambas plataformas, `muted` persiste.

**Fase 5 — Electron + Packaging (1 día)**
- `electron/main`, `preload`, `ipc`, `electron-builder.yml` (NSIS + AppImage/deb). Settings/persistencia por IPC + `electron-store`. Auto-update básico (GitHub Releases, chequeo al arrancar).
- **Hecho cuando:** `npm run build:electron` genera instalador Win + AppImage/deb, funciona offline, IPC validado.

**Fase 6 — Polish, a11y, i18n, QA (1-2 días)**
- A11y (foco, `aria-live`, contraste, keyboard remap opcional), i18n `es/en`, pause/Esc, Playwright con screenshots + Lighthouse CI en build web.
- **Hecho cuando:** budgets §6.1 en verde.

**Oportunidades post-MVP (no en MVP):** Niveles 2/3 (`level_02/03.json` con `level_2.jpg/level_3.png`), power-ups tipados (C/E/L/S/B/P), láser, plata/dorado, enemigos, DOH jefe, partículas/shake/hitstop. Reutilizar backlog arcade A01-A10 del `plan-refactor-arkanoid.md`.

### 6.1 Presupuesto de rendimiento (profile-first, 16.6 ms)

- **FCP <1.5s, LCP <2.5s, CLS <0.1, INP <200 ms** (web), **frame 16.6 ms / 60 FPS** en desktop.
- **Bundle:** Phaser ~1 MB gzip, total renderer **<1.4 MB gzip**, atlas **<1 MB**, audio **<500 KB** (sin `start.wav` 20 MB). Verificar con Vite bundle visualizer + Lighthouse CI.
- **Draw calls objetivo <30**, sin `Instantiate/Destroy` en hot path (pools de Balls/Partículas/SFX), sin allocs por frame, `TexturePacker` atlas único, `BitmapFont` en HUD.

---

## 7. Migración de assets (checklist con tamaños)

- **Imágenes 481 KB total:** optimizar con `sharp` (WebP/PNG, atlas `atlas.png+json`). Mantener pixel-art: `pixelArt:true`, `roundPixels:true`. Reescalar fondos 800×600 con `COVER` si se cambia aspecto.
- **Audio 21 MB total (dominado por `start.wav` 20 MB):** `ffmpeg -y -i in.wav -c:a libvorbis -q:a 4 -ar 48000 -ac 1 out.ogg`. `start.wav` **recortar** (no es usable como intro de 210 s) → loop de 15-30 s o tema dedicado, si no el bundle/packaging empaqueta 20 MB. `levels` WAV → OGG estéreo 48k (~50% menos). Dejar fallback WAV si la target no soporta OGG.
- **Fuentes 600 KB:** subset `fixedsys/free_mono` solo con glyphs usados (`pyftsubset` o `@fontsource`), o **BitmapFont** prerenderizado (`bitmapFont: 'fixedsys'`). Decisión: BitmapFont para HUD retro.
- **Niveles:** generar `levels/level_01.json` desde `assets/levels/level_01.txt` (6 filas `BBB/R-R/Y-Y` 12 cols, fondo `level_1.jpg`). Crear `level_02/03.json` con `level_2.jpg/level_3.png` usando loader validado.
- **Rutas:** `public/assets/...` (Vite sirve y Electron empaqueta con `extraResources`). Nada de `ARKANOID_ASSET_ROOT` ni paths absolutos en prod; `import.meta.env.BASE_URL` + `process.resourcesPath` en Electron.

---

## 8. Scripts, tooling y quality gates

```json
{
  "scripts": {
    "dev": "vite",
    "dev:electron": "concurrently -k \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "tsc -b && vite build",
    "build:electron": "npm run build && electron-builder --win --linux",
    "preview": "vite preview",
    "start": "electron .",
    "lint": "eslint . --max-warnings=0",
    "format": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:e2e": "playwright test",
    "test:smoke": "playwright test smoke"
  }
}
```

- **TS estricto:** `strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitOverride, noFallthroughCasesInSwitch, target ES2022, moduleResolution bundler`. Nada de `any` sin justificar; `unknown` + narrowing en IPC/storage.
- **Lint/format:** ESLint flat + `typescript-eslint` + `react-hooks` + orden de imports. Prettier `semi: false, singleQuote: true`.
- **Tests:** Vitest (`jsdom`) para `state/` y `systems/` (score, colisiones, niveles) — umbral **70%** en `src/state` y `src/game/systems`. Playwright smoke: boot renderiza canvas, menú→nivel, paddle responde a teclado/mouse, romper ladrillo suma score, sin errores de consola, `FIT` responsive.
- **CI sugerida:** `typecheck + lint + test + build web + Lighthouse CI` en GitHub Actions (Windows/Linux). En el primer run, observar (no declarar verde sin evidencia).
- **Lighthouse/perf:** Vite bundle visualizer + Lighthouse CI en el build web antes de `build:electron`.

---

## 9. Riesgos y decisiones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Electron binario 120-180 MB | Descarga/instalación pesada | Aceptable MVP; si >50 MB es requisito, migrar a Tauri **post-MVP** reutilizando `StorageService`/IPC |
| `start.wav` 20 MB / 210 s | Bundle/packaging inflado, intro interminable | Recortar a loop 15-30 s + OGG; si no, extraer como `extraResources` opcional |
| `strict` + `noUncheckedIndexedAccess` frena prototipo | Productividad | Recién en Fase 0; `// @ts-expect-error` acotado con ticket |
| React StrictMode doble-mount de Phaser | Duplicación de canvas en dev | Desactivar `StrictMode` para raíz o hacer `useEffect` idempotente con `game.destroy(true)` |
| A11y solo en canvas | Incumple WCAG | Menús/settings en React con botones reales desde Fase 2 |
| Throttle al `ScoreBoard` legacy | Pérdida de ranks históricos | Migrador best-effort del TSV; la top-10 nueva nace en `scores.v1` |

**Decisiones ya tomadas (no reabrir):**
- Framework: **Phaser 3.90+** (no Excalibur, no canvas custom) — ecosistema y ScaleManager FIT.
- Desktop: **Electron** (no Tauri) — packaging maduro para Win NSIS + Linux AppImage/deb.
- Shell: **React 19 + Zustand**, Phaser aislado en `div ref`, nunca en re-renders por frame.
- Audio: **WebAudio nativo** (no Tone.js) para 9 SFX.
- Formato: **800×600 FIT**, `pixelArt`, fixed-step 60 Hz (misma lógica C++ en `CollisionSystem`/`Config`).

---

## 10. Checklist de aceptación del remake

- [ ] `npm run dev` → Intro → Menu → Level → Rank a 60 FPS en Windows/Linux, sin warnings
- [ ] `npm run build` → preview web funciona offline, Lighthouse en verde
- [ ] `npm run build:electron` → NSIS + AppImage/deb funcionales, offline total, IPC valida con Zod
- [ ] Top-10 persiste tras cerrar/abrir (web `localStorage` y desktop `electron-store`), NameEntry 3-8 chars opera
- [ ] 72 ladrillos, rebote paddle por offset, multiball (3 balls, vida solo al caer la última), `LEVEL CLEARED`/`GAME OVER`
- [ ] Audio 48k nativo sin resampleo visible, `muted` persiste, sin `start.wav` de 20 MB en el bundle
- [ ] Vitest + Playwright smoke en CI, bundle <1.4 MB gzip, draw calls <30, FCP/LCP/CLS/INP en presupuesto

---

## 11. Referencias cruzadas

- Actual: `README.md`, `CMakeLists.txt` (líneas 1-100 y 165-198 de tests), `src/app/Game.cpp`, `src/app/SceneManager.cpp`, `src/scenes/Scene.h`, `src/scenes/LevelScene.cpp/h`, `MenuScene.cpp/h`, `IntroScene.cpp`, `HighScoresScene.cpp`, `ExitScene.cpp`, `src/entities/{Ball,Paddle,Brick,PowerUp,Wall,Player}.h`, `src/systems/{CollisionSystem.cpp,Collision.cpp,Geometry,Config.h,ScoreBoard.h,LevelLoader.h}`, `engine/AudioSystem.cpp`, `assets/levels/level_01.txt`, `docs/hygiene.md`.
- Capturas: `build-levelscene/window-smoke/{intro,menu,level,playing,ranking}.png`.
- Dictamen frontend: **mr-frontend** (stack, React/Phaser, Electron IPC, packaging, scripts, budgets) — usado como referencia para §4-§6.

> Este plan es **solo planificación**. No crea el proyecto nuevo ni toca el build C++ actual.
