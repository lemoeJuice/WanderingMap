import { expect, test } from '@playwright/test'

const style = {
  version: 8,
  sources: {},
  layers: [
    {
      id: 'background',
      type: 'background',
      paint: { 'background-color': '#e8e7dd' },
    },
  ],
}

test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(style),
    }),
  )
})

async function createPlace(
  page: import('@playwright/test').Page,
  name: string,
  offset: number,
): Promise<void> {
  await page
    .getByRole('button', { name: /Add place/ })
    .last()
    .click()
  const map = page.locator('.map-canvas')
  await expect(map).toHaveAttribute('data-map-ready', 'true')
  const canvas = page.locator('.maplibregl-canvas')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Map is not visible')
  await canvas.click({
    position: { x: bounds.width * (0.52 + offset), y: bounds.height * 0.62 },
  })
  await page.getByLabel('Place name').fill(name)
  await page.getByRole('button', { name: 'Save place' }).click()
  await expect(
    page.getByRole('button', { name: new RegExp(name) }).first(),
  ).toBeVisible()
}

test('place visits, connection time, journeys, archive and read-only share stay local', async ({
  page,
  browser,
}) => {
  await page.goto('./')
  await expect(
    page.getByRole('heading', { name: /A life, in places/ }),
  ).toBeVisible()

  await createPlace(page, 'Canal Cafe', 0)
  await page
    .getByRole('button', { name: /Canal Cafe/ })
    .first()
    .click()
  await page.getByRole('button', { name: /Record a visit/ }).click()
  await page.getByLabel(/Time spent/).fill('35')
  await page.getByRole('button', { name: /Record visit/ }).click()
  await expect(page.locator('.detail-stats')).toContainText('1')

  await page.reload()
  await expect(
    page.getByRole('button', { name: /Canal Cafe/ }).first(),
  ).toBeVisible()
  await page
    .getByRole('button', { name: /Canal Cafe/ })
    .first()
    .click()
  await expect(page.locator('.detail-stats')).toContainText('35m')

  await createPlace(page, 'River Garden', 0.06)
  await page
    .getByRole('button', { name: /Canal Cafe/ })
    .first()
    .click()
  await page.getByRole('button', { name: 'Connect' }).click()
  await page.getByLabel('To place').selectOption({ label: 'River Garden' })
  await page.getByLabel('Travel mode').selectOption('metro')
  await page.getByLabel('Line name').fill('Line 2')
  await page.getByLabel('First departure').fill('05:00')
  await page.getByLabel('Last departure').fill('22:00')
  await page.getByRole('button', { name: 'Save connection' }).click()
  await expect(page.locator('.map-stats')).toContainText('1')

  const timeSlider = page.getByRole('slider', { name: 'Map time filter' })
  await timeSlider.evaluate((slider: HTMLInputElement) => {
    slider.value = '23'
    slider.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await expect(page.getByText('1 connection unavailable')).toBeVisible()

  await page.getByRole('link', { name: 'Journeys' }).click()
  await page.getByRole('button', { name: 'New journey' }).click()
  await page.getByLabel('Journey title').fill('Saturday plan')
  await page.getByRole('button', { name: 'Create journey' }).click()
  await page
    .getByLabel('Add a place to the plan')
    .selectOption({ label: 'Canal Cafe' })
  await expect(page.locator('.journey-steps')).toContainText('Canal Cafe')

  await page.getByRole('link', { name: /Back to map/ }).click()
  await expect(page.locator('.map-stats')).toContainText('1')
  await page.getByRole('link', { name: 'Settings' }).click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: /Export .wander.json/ }).click()
  const download = await downloadPromise
  const archiveFile = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of archiveFile) chunks.push(Buffer.from(chunk))
  const archiveJson = Buffer.concat(chunks)

  await page.locator('input[type="file"]').setInputFiles({
    name: 'backup.wander.json',
    mimeType: 'application/json',
    buffer: archiveJson,
  })
  await expect(page.getByText(/Validated archive/)).toBeVisible()
  await page.getByRole('button', { name: 'Merge archive' }).click()
  await expect(page.getByText(/Archive merged successfully/)).toBeVisible()

  await page.getByRole('button', { name: 'Share composer' }).click()
  await page.getByRole('checkbox', { name: 'Canal Cafe' }).check()
  await page.getByRole('button', { name: /Create read-only share URL/ }).click()
  await expect(page.getByRole('textbox', { name: 'Share URL' })).toHaveValue(
    /\/share#data=/,
  )
  const shareUrl = await page
    .getByRole('textbox', { name: 'Share URL' })
    .inputValue()
  const isolatedContext = await browser.newContext()
  const sharedPage = await isolatedContext.newPage()
  await sharedPage.route('https://tiles.openfreemap.org/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(style),
    }),
  )
  await sharedPage.goto(shareUrl)
  await expect(sharedPage.getByText('READ-ONLY SHARED MAP')).toBeVisible()
  await expect(
    sharedPage.getByRole('heading', { name: 'My Wander Map' }),
  ).toBeVisible()
  await expect(
    sharedPage.getByRole('button', { name: /Record a visit/ }),
  ).toHaveCount(0)
  await expect
    .poll(() => sharedPage.evaluate(() => indexedDB.databases()))
    .toEqual([])
  await isolatedContext.close()
})
