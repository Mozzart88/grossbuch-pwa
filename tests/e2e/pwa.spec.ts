import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('PWA has valid app manifest', async ({ page }) => {
  const manifestLink = page.locator('link[rel="manifest"]')
  expect(manifestLink).toBeTruthy()

  const manifestUrl = await manifestLink.getAttribute('href')
  const response = await page.request.get(manifestUrl!)
  const manifest = await response.json()

  expect(manifest.name).toBeTruthy()
  expect(manifest.short_name).toBeTruthy()
  expect(manifest.start_url).toBeTruthy()
  expect(manifest.display).toBeTruthy()
  expect(manifest.theme_color).toBeTruthy()
  expect(manifest.icons.length).toBeGreaterThan(0)
})

test('PWA has registered service worker', async ({ page }) => {

  await page.waitForFunction(_ => navigator.serviceWorker.ready)
  const registration = await page.evaluate(_ => {
    return navigator.serviceWorker.controller !== null
  })
  expect(registration).toBeTruthy()
})

test('PWA caches resources offline', async ({ page, context }) => {
  await page.waitForFunction(_ => navigator.serviceWorker.controller)

  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('h1')).toContainText('Vite + React')
  await context.setOffline(false)
})

// test('PWA triggers installation prompt', async ({ page }) => {
//   await page.addInitScript(_ => {
//     if (window.installPromptEven !== undefined) {
//
//     }
//     window.installPromptEvent = null
//     window.addEventListener('beforeinstallprompt', (e) => {
//       window.installPromptEvent = e
//     })
//   })
//   await page.waitForFunction(_ => window.installPromptEvent !== null)
//   const canInstall = await page.evaluate(_ => window.installPrompt !== null)
//   expect(canInstall).toBeTruthy()
// })
