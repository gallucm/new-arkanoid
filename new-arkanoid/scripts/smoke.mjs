import assert from 'node:assert/strict'
import { env } from 'node:process'
import { chromium } from 'playwright'
import { createServer } from 'vite'

const server = await createServer({
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 0 },
})

try {
  await server.listen()
  const url = server.resolvedUrls?.local[0]
  assert.ok(url, 'Vite did not provide a local URL')

  const browser = await chromium.launch({
    executablePath: env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  })
  try {
    const page = await browser.newPage({
      viewport: { width: 1024, height: 768 },
    })
    page.setDefaultTimeout(10_000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const button = (name) => page.getByRole('button', { name, exact: true })
    const rankingHeading = page.getByRole('heading', {
      name: 'Mejores puntajes',
    })

    await page.goto(url)
    await button('Entrar').press('Enter')
    await button('Jugar').press('ArrowDown')
    assert.equal(
      await button('Ranking').evaluate(
        (element) => element === document.activeElement,
      ),
      true,
    )
    await page.keyboard.press('Enter')
    await rankingHeading.waitFor()
    await page.getByText('Todavía no hay puntajes.').waitFor()
    await page.keyboard.press('Escape')

    await button('Sonido').click()
    assert.equal(await button('Sonido').getAttribute('aria-pressed'), 'false')
    await button('Jugar').click()
    const board = page.getByRole('region', { name: 'Tablero de New Arkanoid' })
    const canvas = board.locator('canvas')
    await canvas.waitFor()
    await page.getByText('Vidas 3', { exact: true }).waitFor()
    await page.waitForFunction(() => {
      const canvas = document.querySelector('.game-container canvas')
      if (canvas === null) return false
      const { width, height } = canvas.getBoundingClientRect()
      return height > 0 && Math.abs(width - (height * 4) / 3) < 2
    })

    const court = await canvas.boundingBox()
    assert.ok(court)
    const movePaddle = (x) =>
      page.mouse.move(
        court.x + (court.width * x) / 800,
        court.y + court.height / 2,
      )

    // Catch the centered serve under its first return. A centered rebound
    // travels vertically through one column and earns enough points to rank.
    await board.press('Space')
    await movePaddle(617)
    await page.getByText(/^Puntaje [1-9]\d+$/).waitFor({ timeout: 25_000 })
    await movePaddle(45)

    // Miss the returns to exercise life loss and the end-of-round screen.
    for (const remainingLives of [2, 1]) {
      await page.getByText(`Vidas ${remainingLives}`, { exact: true }).waitFor()
      await board.press('Space')
      await page.keyboard.press('ArrowLeft', { delay: 900 })
    }

    await page.getByRole('heading', { name: 'Fin de la partida' }).waitFor()
    const scoreText = await page.getByText(/^Puntaje final -?\d+$/).innerText()
    const score = Number(scoreText.match(/-?\d+$/)?.[0])
    assert.ok(score > 0, 'Breaking a brick must award points')
    const playerName = page.getByLabel('Nombre para el ranking')
    await playerName.fill('@@@')
    assert.equal(
      await playerName.evaluate((input) => input.validity.patternMismatch),
      true,
    )
    await playerName.fill('smoke-1')
    await button('Guardar puntaje').click()
    await rankingHeading.waitFor()

    const rankRow = page
      .getByRole('row')
      .filter({ has: page.getByRole('cell', { name: 'SMOKE-1', exact: true }) })
    const rankScore = rankRow.getByRole('cell', {
      name: String(score),
      exact: true,
    })
    await rankScore.waitFor()
    await page.reload()
    await button('Entrar').click()
    assert.equal(await button('Sonido').getAttribute('aria-pressed'), 'false')
    await button('Ranking').click()
    await rankScore.waitFor()

    assert.deepEqual(errors, [], 'Unexpected browser errors')
    console.log(
      'Smoke aprobado. Menú por teclado, partida, puntaje, ranking y persistencia tras recarga.',
    )
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
