import { test, expect } from '@playwright/test'

test.describe('Navigation', () => {
  test('Given the app is loaded, When I visit the root URL, Then I am redirected to /sessions', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/sessions/)
  })

  test('Given I am on sessions, When I click "Stats", Then I see the Stats page', async ({
    page,
  }) => {
    await page.goto('/sessions')
    await page.click('a[href="/stats"]')
    await expect(page).toHaveURL(/\/stats/)
    await expect(page.locator('h1')).toContainText('Stats')
    await page.screenshot({
      path: 'e2e/screenshots/stats-page.png',
      fullPage: true,
    })
  })

  test('Given I am on sessions, When I click "Settings", Then I see the Settings page', async ({
    page,
  }) => {
    await page.goto('/sessions')
    await page.click('a[href="/settings"]')
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.locator('h1')).toContainText('Settings')
    await page.screenshot({
      path: 'e2e/screenshots/settings-page.png',
      fullPage: true,
    })
  })

  test('Given I am on any page, Then the sidebar shows "Claude Dashboard" branding', async ({
    page,
  }) => {
    await page.goto('/sessions')
    await expect(page.locator('aside')).toContainText('Claude')
    await expect(page.locator('aside')).toContainText('Dashboard')
  })
})
