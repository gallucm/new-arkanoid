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

    const rankRow = page.getByRole('row').filter({
      has: page.getByRole('cell', { name: 'SMOKE-1', exact: true }),
    })
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

    await page.keyboard.press('Escape')
    await button('Jugar').click()
    await page.getByText('Vidas 3', { exact: true }).waitFor()
    await board.press('Space')
    await board.press('Escape')
    const pause = page.getByRole('dialog', { name: 'Partida en pausa' })
    const resume = pause.getByRole('button', { name: 'Continuar' })
    await resume.waitFor()
    assert.equal(
      await resume.evaluate((el) => el === document.activeElement),
      true,
    )
    const pausedFrame = await canvas.screenshot()
    await page.waitForTimeout(350)
    assert.deepEqual(await canvas.screenshot(), pausedFrame)
    await page.keyboard.press('Escape')
    await pause.waitFor({ state: 'hidden' })
    assert.equal(
      await board.evaluate((el) => el === document.activeElement),
      true,
    )
    await button('Pausar').click()
    await pause.getByRole('button', { name: 'Salir al menú' }).click()
    await button('Jugar').waitFor()

    // Keep real physics, with one brick per level on the opening serve path.
    const campaign = await browser.newPage()
    campaign.on('pageerror', (error) => errors.push(error.message))
    const fixture = {
      rows: [...Array(5).fill('............'), '.......B....'],
      multiball: { row: 5, column: 7 },
    }
    await campaign.route(/\/level_0[12]\.json(?:\?|$)/, (route) =>
      route.fulfill({
        contentType: 'text/javascript',
        body: `export default ${JSON.stringify(fixture)}`,
      }),
    )
    const campaignButton = (name) =>
      campaign.getByRole('button', { name, exact: true })
    const campaignBoard = campaign.getByRole('region', {
      name: 'Tablero de New Arkanoid',
    })
    await campaign.goto(url)
    await campaignButton('Entrar').click()
    await campaignButton('Jugar').click()
    await campaign.getByText('Nivel 1', { exact: true }).waitFor()
    await campaignBoard.press('Space')
    await campaign.getByRole('heading', { name: '¡Nivel superado!' }).waitFor()
    assert.equal(await campaignButton('Guardar puntaje').count(), 0)
    await campaignButton('Continuar al nivel 2').click()
    await campaign.getByText('Nivel 2', { exact: true }).waitFor()
    await campaign.getByText('Puntaje 2', { exact: true }).waitFor()
    await campaign.getByText('Vidas 3', { exact: true }).waitFor()
    await campaignBoard.press('Space')
    await campaign
      .getByRole('heading', { name: '¡Campaña completada!' })
      .waitFor()
    await campaign.getByText('Puntaje final 4', { exact: true }).waitFor()
    await campaign.getByLabel('Nombre para el ranking').fill('FINAL')
    await campaignButton('Guardar puntaje').click()
    await campaign.getByRole('cell', { name: 'FINAL' }).waitFor()
    await campaign.close()

    assert.deepEqual(errors, [], 'Unexpected browser errors')
    console.log(
      'Smoke aprobado. Menú, pausa, campaña, puntaje, ranking y persistencia.',
    )
  } finally {
    await browser.close()
  }
} finally {
  await server.close()
}
