# New Arkanoid

Remake de Arkanoid con React, TypeScript y Phaser. Incluye una campaña de dos
niveles, multiball, efectos de sonido y un ranking local de diez puestos.

## Requisitos

Para ejecutar el proyecto desde el código fuente, usá Node.js 22.22.2 o
posterior dentro de la rama 22, o Node.js 24.15.0 o posterior dentro de la rama
24, con npm. La primera instalación descarga las dependencias y Electron.

## Jugar en el navegador

Desde la carpeta del proyecto:

```sh
npm ci
npm run dev
```

Abrí la URL que muestra Vite. Si el navegador requiere una interacción para
reproducir audio, elegí **Escuchar música** en la portada.

## Jugar en escritorio

- **Windows:** abrí `play.bat` o ejecutá `.\play.bat` desde una terminal.
- **Linux:** ejecutá `./play.sh`. Si la copia perdió el permiso de ejecución,
  ejecutá `chmod +x play.sh` primero.

Los lanzadores trabajan desde su propia carpeta, instalan las dependencias si
falta el ejecutable de Electron para la plataforma, compilan el proyecto y
abren el juego. Si ya instalaste las dependencias, también podés ejecutar
`npm run desktop` desde la carpeta del proyecto.

## Controles y reglas

| Acción              | Controles                          |
| ------------------- | ---------------------------------- |
| Mover la paleta     | Flechas, puntero o arrastre        |
| Lanzar la pelota    | Espacio, clic o toque              |
| Pausar o reanudar   | Esc o los botones del juego        |
| Navegar por el menú | Flechas o Tab, y Enter para elegir |

Cada partida empieza con tres vidas. Romper un ladrillo suma dos puntos.
Atrapar el bonus agrega dos pelotas. Perdés una vida y tres puntos cuando cae
la última pelota activa. Al superar el primer nivel, pasás al segundo con
las vidas y el puntaje acumulados. Al ganar el segundo nivel o quedarte sin
vidas, podés guardar el resultado si clasifica para el top 10.

Durante la partida, Esc abre la pausa. Podés continuar desde el mismo punto
o salir al menú principal y abandonar la partida.

La música suena en la portada y se detiene al entrar al menú. Los efectos
suenan durante la partida. El botón **Sonido** del menú y del tablero guarda
tu preferencia.

El ranking web se guarda en el almacenamiento local del navegador. Electron
guarda su propio ranking en `ranking.v1.json` dentro del directorio de datos de
la aplicación.

## Verificar

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

La prueba de navegador también acepta un Chrome instalado. Definí la variable
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` con la ruta al ejecutable antes de correr
`npm run test:e2e`.

## Empaquetar para distribución

Con las dependencias instaladas, ejecutá `npm run build:electron`. El paquete
se genera en `release/`. Linux genera AppImage y Windows genera un instalador
NSIS. Generar el instalador NSIS desde Linux requiere Wine.

Para generar un ejecutable portátil de Windows, usá
`npm run build:electron -- --win portable`.

### Instalar en Zorin OS, Ubuntu o Debian

Para generar el instalador de Linux x64, ejecutá
`npm run build:electron -- --linux deb --x64`. Abrí el archivo
`new-arkanoid_0.0.0_amd64.deb` de `release/` con el gestor de paquetes o
instalalo desde la carpeta del proyecto:

```sh
sudo apt install ./release/new-arkanoid_0.0.0_amd64.deb
```

Después buscá **New Arkanoid** en el menú de aplicaciones. Para desinstalarlo,
usá `sudo apt remove new-arkanoid`.

El [roadmap](./plan-new-arkanoid-electron.md) describe la migración completa.
